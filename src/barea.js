/**
 * barea.js
 * 
 * Author: Johan Filipsson
 * Version: 1.0.0
 * License: MIT
 * Description: A lightweight and reactive JavaScript library for modern web applications.
 * 
 * Copyright (c) 2025 Johan Filipsson
 */
function getApp(data, enableInternalId){
    return new BareaApp(data, enableInternalId);
}

class BareaApp {

    #bareaId=0;
    #enableBareaId = false;
    #enableInterpolation = true;
    #appElement; 
    #appData; 
    #appDataProxy; 
    #eventHandlers = {};
    #consoleLogs = [];
    #domDictionary = []; //Reference dom from paths
    #domDictionaryId=0;

    constructor(data, enableInternalId) {
        this.#appData = data;
        this.#enableBareaId=enableInternalId;
        this.#setConsoleLogs();
    }

    mount(element) 
    {
        this.#appElement = element;
        this.#appDataProxy = this.#createReactiveProxy((path, value, key) => 
        { 
            //Handles changes in the data and updates the dom

            let log = this.#getConsoleLog(1);
            if (log.active)
                console.log(log.name, path, value, key);

            this.#renderTemplates(key, path, value);
            this.#setupBindings(path);
            this.#applyProxyChangesToDOM(path, value);

        }, this.#appData);

       
        this.#buildDomDictionary();
        this.#renderTemplates();
        this.#setupBindings();
        this.#applyProxyChangesToDOM();

        if (this.#enableBareaId && ! this.#appDataProxy.hasOwnProperty('baId')) 
            this.#appDataProxy.baId = ++this.#bareaId;  // Assign a new unique ID
   
    }

    getData()
    {
        return this.#appDataProxy;
    }

    enableInterpolation(value)
    {
        if (this.#isPrimitive(value))
            this.#enableInterpolation = value;
    }
   
    addHandler(functionName, handlerFunction) {
        if (typeof handlerFunction === "function") {
            this.#eventHandlers[functionName] = handlerFunction;
        } else {
            console.warn(`Handler for "${functionName}" is not a function.`);
        }
    }

    getPathData(path) {
        const keys = path.match(/[^.[\]]+/g);
        let target = this.#appDataProxy;
    
        // Loop with for (faster than forEach)
        for (let i = 0; i < keys.length; i++) {
            if (i === 0 && keys[i].toLowerCase() === 'root') continue; // Skip 'root' only if it's the first key
            if (!target) return undefined; // Exit early if target becomes null/undefined
            target = target[keys[i]];
        }
    
        return target;
    }

    #createReactiveProxy(callback, data, currentpath = "root") {
      
        const handler = {
            get: (target, key) => {
                const value = target[key];
                const newPath = Array.isArray(target) ? `${currentpath}[${key}]` : `${currentpath}.${key}`;
              
              
                // If the value is already a proxy, return it as is to avoid recursive proxying
                if (value && value.__isProxy) {
                    return value;
                }

                if (typeof value === 'object' && value !== null) 
                {
                    if (!Array.isArray(value) && this.#enableBareaId && !value.hasOwnProperty('baId')) 
                    {
                            value.baId = ++this.#bareaId;  
                    }

                    return this.#createReactiveProxy(callback, value, newPath); 

                }else{

                    if(typeof value === "function")
                    {
                        if (['push', 'pop', 'splice', 'shift', 'unshift'].includes(value.name)) 
                        {
                            return (...args) => {
                                const result = Array.prototype[value.name].apply(target, args);
                                callback(currentpath, target, key); // Trigger DOM update on array changes
                                return result;
                            };
                        }    
        
                    }
                }
              
                return value;
            },
            set: (target, key, value) => {

                if (target[key] === value) 
                    return true;
        
                target[key] = value;

                if (['length'].includes(key)) 
                    return true;

                const path = Array.isArray(target) ? `${currentpath}[${key}]` : `${currentpath}.${key}`;
                callback(path, value, key);
                return true;
            }
        };
        
        return new Proxy(data, handler);
    }
    


   
    #buildDomDictionary(tag = this.#appElement, templateId=-1)
    {
        const templateChildren=[];

        function collectDescendants(ce) {
            templateChildren.push(ce);
            
            for (let i = 0; i < ce.children.length; i++) {
                collectDescendants(ce.children[i]);
            }
        }
        tag.querySelectorAll("[ba-foreach]").forEach(parent => {
            Array.from(parent.children).forEach(child => collectDescendants(child));
        });


        const bareaelements = [...tag.querySelectorAll("*")].filter(el => 
            [...el.attributes].some(attr => attr.name.startsWith("ba-"))
        );

        bareaelements.forEach(el => {
            const bareaAttributes = el.getAttributeNames()
            .filter(attr => attr.startsWith("ba-"))
            .map(attr => ({ name: attr, value: el.getAttribute(attr) }));

            //Skip all children of templates since they will be dealt with later on template rendering
            if (templateChildren.includes(el))
                return;

            bareaAttributes.forEach(attr =>
            {
   
                if (['ba-foreach'].includes(attr.name))
                {
                    let templateHtml = el.innerHTML.trim()
                        .replace(/>\s+</g, '><')  // Remove spaces between tags
                        .replace(/(\S)\s{2,}(\S)/g, '$1 $2'); // Reduce multiple spaces to one inside text nodes

                    const odo = this.#createDomDictionaryObject(el.parentElement, null, attr.name, attr.value, "template", true, templateHtml, el.localName, -1, null);
                    this.#domDictionary.push(odo);
                    el.remove();
                }

                if (['ba-hide', 'ba-show'].includes(attr.name))
                {
                    const odo = this.#createDomDictionaryObject(el,null,attr.name,attr.value, "oneway", true,"","",templateId,null);
                    this.#domDictionary.push(odo);
                }

                if (['ba-bind'].includes(attr.name))
                {
                    const odo = this.#createDomDictionaryObject(el,null,attr.name,attr.value, "binding", true,"","",templateId,null);
                    this.#domDictionary.push(odo);
                }

                if (['ba-click'].includes(attr.name)){
                    let expressions=[];
                    expressions.push(attr.value);
                    const odo = this.#createDomDictionaryObject(el,null,attr.name,"", "handler", true,"","",templateId, expressions);
                    this.#domDictionary.push(odo);
                }
            });

        });

        if (this.#enableInterpolation)
        {
            const walker = document.createTreeWalker(tag, NodeFilter.SHOW_TEXT, null, false);
            while (walker.nextNode()) {
                if (walker.currentNode.nodeValue.includes("{{") && walker.currentNode.nodeValue.includes("}}"))
                {
                    let paths = this.#getInterpolationPaths(walker.currentNode.nodeValue);
                    const odo = this.#createDomDictionaryObject(walker.currentNode.parentElement,walker.currentNode,"interpolation","", "interpolation", true,walker.currentNode.nodeValue,"",templateId, paths);
                    this.#domDictionary.push(odo);
                }
            }
        }

        let log = this.#getConsoleLog(4);
        if (log.active){
            console.log('dom dictionary: ' +  this.#domDictionary.length);
            this.#domDictionary.forEach(t=> {
                console.log(t);
            });
        }
    }

    #removeFromDomDictionaryById(id) 
    {
        this.#domDictionary = this.#domDictionary.filter(item => item.id !== id);
    }

    #removeTemplateChildrenFromDomDictionary(templatedId) 
    {
        this.#domDictionary = this.#domDictionary.filter(item => item.templateId !== templatedId); 
    }

    #createDomDictionaryObject(element, node, directive, path, bareaType, isnew, templateMarkup, templateTagName, templateId, expressions)
    {
        if (!expressions)
        {
            expressions = [];
            expressions.push(path);
        }

        let id = this.#domDictionaryId++;

        return {id: id, templateId: templateId, element: element, node:node, directive: directive,  path:path, bareatype: bareaType, isnew: isnew, templateMarkup: templateMarkup, templateTagName: templateTagName, expressions: expressions  };
    }
  

    #setupBindings(path='root') 
    {

        let workscope = [];
        if (path.toLowerCase()=='root')
            workscope = this.#domDictionary.filter(p=> p.isnew && ['binding', 'handler'].includes(p.bareatype));
        else
            workscope= this.#domDictionary.filter(p=> p.isnew && ((p.path.includes(path) && p.bareatype==='binding') || p.bareatype==='handler'));

    
        workscope.forEach(item => 
        {

            if (item.directive==="ba-bind" && !item.element.dataset.bareaBindBound)
            {
                item.isnew = false;
                item.element.addEventListener("input", (event) => {

                    const keys = item.path.match(/[^.[\]]+/g); // Extracts both object keys and array indices
                    let valuekey = null;
                    let target = this.#appDataProxy;

                    keys.forEach((key, index) => {
                        if (key.toLowerCase()!=='root')
                        {
                            if (typeof target[key] === 'object') 
                                target = target[key];
        
                            valuekey=key;
                        }
                    });
        
                    if (!valuekey)
                        return;
                    if (!target)
                        return;


                    const log = this.#getConsoleLog(3);
                    let customhandler = item.element.getAttribute('ba-bind-handler');
                    if (customhandler)
                    {
                        if (customhandler.includes('('));
                            customhandler = customhandler.split('(')[0];
                        customhandler=customhandler.trim();

                        if (this.#eventHandlers[customhandler]) {
                            this.#eventHandlers[customhandler].apply(this, ['SET_DATA', item.element, target]);
                        } else {
                            console.warn(`Handler function '${customhandler}' not found.`);
                        }
                        return;
                    }


                    if (item.element.type === "checkbox") 
                    {
                        if (log.active)
                            console.log(log.name, "type: " + item.element.type, "key: " + valuekey, "input value: " + item.element.checked);
                        target[valuekey] =  item.element.checked;
                    } 
                    else if ( item.element.type === "radio") 
                    {
                        if (log.active)
                            console.log(log.name, "type: " + item.element.type, "key: " + valuekey, "input value: " + item.element.value);

                        if (item.element.checked)
                            target[valuekey] =  item.element.value;
                    } 
                    else 
                    {
                        if (log.active)
                            console.log(log.name, "type: " + item.element.type, "key: " + valuekey, "input value: " + item.element.value);

                        target[valuekey] =  item.element.value;
                    }
                });

                // Mark the element as bound
                item.element.dataset.bareaBindBound = "true";  

            }

            if (item.directive=== "ba-click" && !item.element.dataset.bareaClickBound)
            {
                if (!item.expressions)
                    return;

                item.isnew = false;
                let handlername = item.expressions[0];
                let match = handlername.match(/^(\w+)\((.*?)\)$/);
                if (match) {
                    let functionName = match[1];  // Function name (e.g., handleDeleteCar)
                    let argExpression = match[2]; // Arguments inside parentheses (e.g., car)

                    item.element.addEventListener("click", (event) => {
                        // Resolve arguments dynamically
                        let arglist = argExpression.split(",").map(arg => arg.trim()); // Split multiple arguments
                        let args = arglist.map(arg => {
                            if (arg === "event") 
                                return event; // Allow `event` as a parameter

                            const path = this.#getClosestAttribute(event.target, "ba-path"); 
                            if (path)
                            {
                                const varname = this.#getClosestAttribute(event.target,"ba-varname"); 
                                if (arg!=varname)
                                {
                                    console.warn(`Error The variable ${arg} used in ${functionName} does not match the ba-foreach expression, should be '${varname}'`);
                                }
                                return this.getPathData(path);
                            }
                            else
                                return this.getPathData(arg);

                        });
                        
                        // Call the function from the handlers object
                        if (this.#eventHandlers[functionName]) {
                            this.#eventHandlers[functionName].apply(this, args);
                        } else {
                            console.warn(`Handler function '${functionName}' not found.`);
                        }
                    });

                    // Mark the element as bound
                    item.element.dataset.bareaClickBound = "true";  

                } else {
                    console.warn(`Invalid ba-click expression: ${handlername}`);
                }
            }

        });
    
    }

  
    #renderTemplates(operation='init', path='root', array=this.#appDataProxy) 
    {

        let foreacharray = [];
  
        if (path.includes('['))
            return; //throw new Error('renderTemplates was called with an object in the array');

        let isSinglePush = operation === "push";
        let templates = [];
        if (path.toLowerCase()==='root')
            templates = this.#domDictionary.filter(p=> p.bareatype==='template');
        else
            templates = this.#domDictionary.filter(p=> p.path.includes(path) && p.bareatype==='template');

        templates.forEach(template => {

            let [varname, datapath] = template.path.split(" in ").map(s => s.trim());
            if (!varname)
                throw new Error('No variable name was found in the ba-foreach expression');

            if (!Array.isArray(array))
                foreacharray = this.getPathData(datapath);
            else
                foreacharray= array;

            if (!Array.isArray(foreacharray))
                return; //throw new Error('renderTemplates could not get array, ' + path);

           if ((foreacharray.length - template.element.children.length) !== 1)
                isSinglePush=false;

           let counter=0;
            if (!isSinglePush)
            {
                this.#removeTemplateChildrenFromDomDictionary(template.id);
                template.element.innerHTML = ""; // Clear list
            }
            else
            {
                counter = foreacharray.length-1;
                foreacharray = foreacharray.slice(-1);
            }

            const fragment = document.createDocumentFragment();

            foreacharray.forEach(item => {
                const newtag = document.createElement(template.templateTagName);
                let interpolationpaths = this.#getInterpolationPaths(template.templateMarkup);
                if (interpolationpaths.length>0)
                {
                    let regex = new RegExp(`{{([^}]*)\\b${varname}\\b([^}]*)}}`, "g");
                    newtag.innerHTML = template.templateMarkup.replace(regex, (match, before, after) => {return `{{${before}${datapath}[${counter}]${after}}}`});
                }
                else
                {
                    newtag.innerHTML = template.templateMarkup;
                }
              
                newtag.setAttribute("ba-varname", varname);
                newtag.setAttribute("ba-path", `${datapath}[${counter}]`);
                newtag.setAttribute("ba-index", counter);
                if (newtag.id)
                    newtag.id = newtag.id + `-${counter}` 
                else
                    newtag.id = `${template.id}-${varname}-${counter}`; 

                fragment.appendChild(newtag);
               
                //Add references to click handlers
                newtag.querySelectorAll("[ba-click]").forEach(el => 
                {
                    el.setAttribute("ba-varname", varname);
                    el.setAttribute("ba-path", `${datapath}[${counter}]`);
                    el.setAttribute("ba-index", counter);
                });

                //Add references to input bindings
                newtag.querySelectorAll("[ba-bind]").forEach(el => 
                {
                    el.setAttribute("ba-varname", varname);
                    el.setAttribute("ba-path", `${datapath}[${counter}]`);
                    el.setAttribute("ba-index", counter);
                    let attrib = el.getAttribute("ba-bind");
                    if (!attrib.includes(varname))
                        console.warn(`Error The input binding ${attrib} used in an element under ba-foreach does not match the ba-foreach expression, should include '${varname}'`);

                    let bindingpath = attrib.replace(varname,`${datapath}[${counter}]`);
                    el.setAttribute("ba-bind", bindingpath);

                });

                let templatechildren = newtag.querySelectorAll("*"); 
                templatechildren.forEach(child => 
                {
                    if (child.id)
                        child.id = child.id + `-${counter}` 
                    else
                        child.id = `${varname}-${counter}`; 

                    let forattrib = child.getAttribute("for");
                    if (forattrib)
                        child.setAttribute("for", forattrib + `-${counter}`); 
                   

                });
    

                this.#buildDomDictionary(newtag, template.id);

                counter++;

            });

            if (fragment.childElementCount>0)
                template.element.appendChild(fragment);
           
        });    
    }

    #applyProxyChangesToDOM(path='root', value=this.#appDataProxy) 
    {
      
        //console.log(path, value);
        function interpolate(instance)
        {
            const interpolations = instance.#domDictionary.filter(p=>p.bareatype==="interpolation");
            interpolations.forEach(t=>
            {
                let count=0;
                let content= t.templateMarkup;
                t.expressions.forEach(expr=> 
                {
                    //Just to speed up
                    //If primitive (path), example : root.model.user.firstname
                    //Only interpolate root, root.model, root.model.user, root.model.user.firstname
                    if (instance.#isPrimitive(value))
                    {
                        if (!path.includes(expr))
                            return;
                    }

                    let exprvalue = null;

                    if (expr.toLowerCase()=== 'index')
                        exprvalue = instance.#getClosestAttribute(t.element, 'ba-index');
                    else
                        exprvalue = instance.getPathData(expr);

                    if (!exprvalue)
                        exprvalue ="";

                    if (typeof exprvalue === "object") 
                        exprvalue = JSON.stringify(exprvalue)
                  
                    count++;
                    const regex = new RegExp(`{{\\s*${expr.replace(/[.[\]]/g, '\\$&')}\\s*}}`, 'g');
                    content = content.replace(regex, exprvalue);        
                    
                });
                if (count>0)
                    t.node.textContent = content;

            });

        }

       
        function updateElements(path, value, instance)
        {

                const bareabind = instance.#domDictionary.filter(p=>p.bareatype==="binding" && ((instance.#isPrimitive(value) && (p.path===path)) || (!instance.#isPrimitive(value) && (p.path!==""))) && p.directive==='ba-bind');
                bareabind.forEach(t=>
                {
                    let boundvalue = value;
                    if (bareabind.length> 1 || !instance.#isPrimitive(boundvalue))
                        boundvalue = instance.getPathData(t.path);

                    let customhandler = t.element.getAttribute('ba-bind-handler');
                    if (customhandler)
                    {
                        if (customhandler.includes('('));
                            customhandler = customhandler.split('(')[0];
                        customhandler=customhandler.trim();

                        if (instance.#eventHandlers[customhandler]) {
                            instance.#eventHandlers[customhandler].apply(this, ['SET_UI', t.element, boundvalue]);
                        } else {
                            console.warn(`Handler function '${customhandler}' not found.`);
                        }
                        return;
                    }


                    if (t.element.type === "checkbox") 
                    {
                        if (!boundvalue)
                            boundvalue=false;

                        t.element.checked = boundvalue;
                    } 
                    else if (t.element.type === "radio")
                    {
                        t.element.checked = t.element.value === boundvalue;
                    } 
                    else 
                    {
                        if (!boundvalue)
                            boundvalue="";

                        t.element.value = boundvalue;
                    }                     
                });

                const bareahide = instance.#domDictionary.filter(p=>p.bareatype==="oneway" && ((instance.#isPrimitive(value) && (p.path===path)) || p.path!=="") && p.directive==='ba-hide');
                bareahide.forEach(t=>
                {
                    let boundvalue = value;
                    if (bareahide.length> 1  || !instance.#isPrimitive(boundvalue))
                        boundvalue = instance.getPathData(t.path);

                    t.element.style.display = boundvalue ? "none" : "";               
                });

                const bareashow = instance.#domDictionary.filter(p=>p.bareatype==="oneway" && ((instance.#isPrimitive(value) && (p.path===path)) || p.path!=="") && p.directive==='ba-show');
                bareashow.forEach(t=>
                {
                    let boundvalue = value;
                    if (bareahide.length> 1  || !instance.#isPrimitive(boundvalue))
                        boundvalue = instance.getPathData(t.path);

                    t.element.style.display = boundvalue ? "" : "none";
            
                });
           
        }

        /****** Interpolation ******/
        interpolate(this);
       
        /******* Element boinding ******/
        updateElements(path,value,this);

    }

    /*** Internal Helpers ***/

   
    #getClosestAttribute(element, name)
    {
        let val = element.getAttribute(name);
        let p = element.parentElement;
        let safecnt=0;
        while (!val && p)
        {
            safecnt++;
            val = p.getAttribute(name);
            p=p.parentElement;
            if (safecnt>10)
                break;
        }

        return val || "";
    
    }

   
    //Get interpolation data paths from a string found in the dom
    #getInterpolationPaths(str) {
        const regex = /{{(.*?)}}/g;
        let matches = [];
        let match;
    
        while ((match = regex.exec(str)) !== null) {
            matches.push(match[1].trim()); // Trim spaces inside {{ }}
        }
    
        return matches;
    }


    #isPrimitive(value)
    {
        let result = value !== null && typeof value !== "object" && typeof value !== "function";
        return result;
    }

    //Generates a flat object from any object
    getObjectDictionary(obj, parentKey = '') {
        let result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = parentKey ? `${parentKey}.${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (Array.isArray(obj[key])) {
                        result[newKey] = obj[key]; 
                        obj[key].forEach((item, index) => {
                            result[`${newKey}[${index}]`] = item; 
                            Object.assign(result, this.getObjectDictionary(item, `${newKey}[${index}]`));
                        });
                    } else {
                        result[newKey] = obj[key]; 
                        Object.assign(result, this.getObjectDictionary(obj[key], newKey));
                    }
                } else {
                    result[newKey] = obj[key];  
                }
            }
        }
    
        return result;
    }
    
    /*  Logging  */
    enableConsoleLog(id, active)
    {
        const logidx = this.#consoleLogs.findIndex(p=> p.id===id);
        if (logidx!== -1)
            this.#consoleLogs[logidx].active = active;
    }

    printConsoleLogs()
    {
      this.#consoleLogs.forEach(p=> console.log(p));
    }

    #setConsoleLogs(){
        this.#consoleLogs = [
            {id: 1, name: "Proxy call back: ", active:false},
            {id: 2, name: "Update dom on proxy change: ", active:false},
            {id: 3, name: "Update proxy on user input: ", active:false},
            {id: 4, name: "Build dom dictionary: ", active:false}
        ];
    } 

    #getConsoleLog(id) 
    {
        const log = this.#consoleLogs.find(log => log.id === id);
        if (!log)
            return {id:-1, name:"", active:false};
        return log;
    }

  
                   
      
    

   
    
}
