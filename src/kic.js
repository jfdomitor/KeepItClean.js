
function getKICApp(data, enableInternalId){
    return new KicApp(data, enableInternalId);
}

class KicApp {

    #kicId=0;
    #enableKicId = false;
    #enableInterpolation = true;
    #appElement; 
    #appData; 
    #appDataProxy; 
    #eventHandlers = {};
    #consoleLogs = [];
    #domDictionary = []; //Reference dom from paths

    constructor(data, enableInternalId) {
        this.#appData = data;
        this.#enableKicId=enableInternalId;
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

        if (this.#enableKicId && ! this.#appDataProxy.hasOwnProperty('kicId')) 
            this.#appDataProxy.kicId = ++this.#kicId;  // Assign a new unique ID
   
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

    #createReactiveProxy(callback, data, currentpath = "kic") {
      
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
                    if (!Array.isArray(value) && this.#enableKicId && !value.hasOwnProperty('kicId')) 
                    {
                            value.kicId = ++this.#kicId;  
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
    


   
    #buildDomDictionary(tag = this.#appElement)
    {
        const templateChildren=[];

        function collectDescendants(ce) {
            templateChildren.push(ce);
            
            for (let i = 0; i < ce.children.length; i++) {
                collectDescendants(ce.children[i]);
            }
        }
        tag.querySelectorAll("[kic-foreach]").forEach(parent => {
            Array.from(parent.children).forEach(child => collectDescendants(child));
        });


        const kicelements = [...tag.querySelectorAll("*")].filter(el => 
            [...el.attributes].some(attr => attr.name.startsWith("kic-"))
        );

        kicelements.forEach(el => {
            const kicAttributes = el.getAttributeNames()
            .filter(attr => attr.startsWith("kic-"))
            .map(attr => ({ name: attr, value: el.getAttribute(attr) }));

            //Skip all children of templates since they will be dealt with later on template rendering
            if (templateChildren.includes(el))
                return;

            kicAttributes.forEach(attr =>
            {
   
                if (['kic-foreach'].includes(attr.name))
                {
                    let templateHtml = el.innerHTML.trim()
                        .replace(/>\s+</g, '><')  // Remove spaces between tags
                        .replace(/(\S)\s{2,}(\S)/g, '$1 $2'); // Reduce multiple spaces to one inside text nodes

                    const odo = this.#createDomDictionaryObject(el.parentElement, null, attr.name, attr.value, "template", true, templateHtml, el.localName, null);
                    this.#domDictionary.push(odo);
                    el.remove();
                }

                if (['kic-hide', 'kic-show'].includes(attr.name))
                {
                    const odo = this.#createDomDictionaryObject(el,null,attr.name,attr.value, "oneway", true,"","",null);
                    this.#domDictionary.push(odo);
                }

                if (['kic-bind'].includes(attr.name))
                {
                    const odo = this.#createDomDictionaryObject(el,null,attr.name,attr.value, "binding", true,"","",null);
                    this.#domDictionary.push(odo);
                }

                if (['kic-click'].includes(attr.name)){
                    const odo = this.#createDomDictionaryObject(el,null,attr.name,attr.value, "handler", true,"","",null);
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
                    const odo = this.#createDomDictionaryObject(walker.currentNode.parentElement,walker.currentNode,"interpolation","", "interpolation", true,walker.currentNode.nodeValue,"",paths);
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

    #removeFromDomDictionary(element) 
    {
        this.#domDictionary = this.#domDictionary.filter(item => 
            item.element !== element && !element.contains(item.element)
        );
    }

    #createDomDictionaryObject(element, node, directive, path, kictype, isnew, templateMarkup, templateTagName, expressions)
    {
        if (!expressions)
        {
            expressions = [];
            expressions.push(path);
        }

        return {element: element, node:node, directive: directive,  path:path, kictype: kictype, isnew: isnew, templateMarkup: templateMarkup, templateTagName: templateTagName, expressions: expressions  };
    }
  

    #setupBindings(path='kic') 
    {

        let workscope = [];
        if (path.toLowerCase()=='kic')
            workscope = this.#domDictionary;
        else
            workscope= this.#domDictionary.filter(p=> p.path.includes(path) && p.isnew);

    
        workscope.forEach(item => 
        {

            if (item.directive==="kic-bind" && !item.element.dataset.kicBindBound)
            {
                item.isnew = false;
                item.element.addEventListener("input", (event) => {

                    const keys = item.path.match(/[^.[\]]+/g); // Extracts both object keys and array indices
                    let valuekey = null;
                    let target = this.#appDataProxy;

                    keys.forEach((key, index) => {
                        if (key.toLowerCase()!=='kic')
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
                item.element.dataset.kicBindBound = "true";  

            }

            if (item.directive=== "kic-click" && !item.element.dataset.kicClickBound)
            {
                item.isnew = false;
                let match = item.path.match(/^(\w+)\((.*?)\)$/);
                if (match) {
                    let functionName = match[1];  // Function name (e.g., handleDeleteCar)
                    let argExpression = match[2]; // Arguments inside parentheses (e.g., car)

                    item.element.addEventListener("click", (event) => {
                        // Resolve arguments dynamically
                        let arglist = argExpression.split(",").map(arg => arg.trim()); // Split multiple arguments
                        let args = arglist.map(arg => {
                            if (arg === "event") 
                                return event; // Allow `event` as a parameter

                            const path = event.target.getAttribute("kic-path"); 
                            if (path)
                            {
                                const varname = event.target.getAttribute("kic-varname"); 
                                if (arg!=varname)
                                {
                                    console.warn(`Error The variable ${arg} used in ${functionName} does not match the kic-foreach expression, should be '${varname}'`);
                                }
                                return this.#getValueByPath(path);
                            }
                            else
                            return this.#getValueByPath(arg);

                        });
                        
                        // Call the function from the handlers object
                        if (this.#eventHandlers[functionName]) {
                            this.#eventHandlers[functionName].apply(this, args);
                        } else {
                            console.warn(`Handler function '${functionName}' not found.`);
                        }
                    });

                    // Mark the element as bound
                    item.element.dataset.kicClickBound = "true";  

                } else {
                    console.warn(`Invalid kic-click expression: ${expression}`);
                }
            }

        });
    
    }

  
    #renderTemplates(operation='init', path='kic', array=this.#appDataProxy) 
    {

        let foreacharray = [];
  
        if (path.includes('['))
            return; //throw new Error('renderTemplates was called with an object in the array');

        let isSinglePush = operation === "push";
        let templates = [];
        if (path.toLowerCase()==='kic')
            templates = this.#domDictionary.filter(p=> p.kictype==='template');
        else
            templates = this.#domDictionary.filter(p=> p.path.includes(path) && p.kictype==='template');

        templates.forEach(template => {

            let [varname, datapath] = template.path.split(" in ").map(s => s.trim());

            if (!Array.isArray(array))
                foreacharray = this.#getValueByPath(datapath);
            else
                foreacharray= array;

            if (!Array.isArray(foreacharray))
                return; //throw new Error('renderTemplates could not get array, ' + path);

           if ((foreacharray.length - template.element.children.length) !== 1)
                isSinglePush=false;

           let counter=0;
            if (!isSinglePush)
            {
                //this.#removeFromDomDictionary(template.element);
                template.element.innerHTML = ""; // Clear list
            }
            else
            {
                counter = foreacharray.length-1;
                foreacharray = foreacharray.slice(-1);
            }

        
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
              
                newtag.setAttribute("kic-varname", varname);
                newtag.setAttribute("kic-path", `${datapath}[${counter}]`);
                newtag.setAttribute("kic-index", counter);
                newtag.dataset.kicIndex = counter;
                template.element.appendChild(newtag);
               
                //Add references to click handlers
                newtag.querySelectorAll("[kic-click]").forEach(el => 
                {
                    el.setAttribute("kic-varname", varname);
                    el.setAttribute("kic-path", `${datapath}[${counter}]`);
                    el.setAttribute("kic-index", counter);
                });

                //Add references to input bindings
                newtag.querySelectorAll("[kic-bind]").forEach(el => 
                {
                    el.setAttribute("kic-varname", varname);
                    el.setAttribute("kic-path", `${datapath}[${counter}]`);
                    el.setAttribute("kic-index", counter);
                    let attrib = el.getAttribute("kic-bind");
                    if (!attrib.includes(varname))
                        console.warn(`Error The input binding ${attrib} used in an element under kic-foreach does not match the kic-foreach expression, should include '${varname}'`);

                    let bindingpath = attrib.replace(varname,`${datapath}[${counter}]`);
                    el.setAttribute("kic-bind", bindingpath);

                });

                this.#buildDomDictionary(newtag);

                counter++;

            });
           
        });    
    }

    #applyProxyChangesToDOM(path='kic', value=this.#appDataProxy) 
    {
      
        //console.log(path, value);
        function interpolate(instance)
        {
            const interpolations = instance.#domDictionary.filter(p=>p.kictype==="interpolation");
            interpolations.forEach(t=>
            {
                let count=0;
                let content= t.templateMarkup;
                t.expressions.forEach(expr=> 
                {
                    let exprvalue = null;

                    if (expr.toLowerCase()=== 'index')
                        exprvalue = instance.#getClosestAttribute(t.element, 'kic-index');
                    else
                        exprvalue = instance.#getValueByPath(expr);

                    if (!exprvalue)
                        return;

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

                const kicbind = instance.#domDictionary.filter(p=>p.kictype==="binding" && ((instance.#isPrimitive(value) && (p.path===path)) || p.path!=="") && p.directive==='kic-bind');
                kicbind.forEach(t=>
                {
                    let boundvalue = value;
                    if (kicbind.length> 1 || !instance.#isPrimitive(boundvalue))
                        boundvalue = instance.#getValueByPath(t.path);

                    if (t.element.type === "checkbox") {
                        t.element.checked = boundvalue;
                    } else if (t.element.type === "radio") {
                        t.element.checked = t.element.value === boundvalue;
                    } else {
                        t.element.value = boundvalue;
                    }                     
                });

                const kichide = instance.#domDictionary.filter(p=>p.kictype==="oneway" && ((instance.#isPrimitive(value) && (p.path===path)) || p.path!=="") && p.directive==='kic-hide');
                kichide.forEach(t=>
                {
                    let boundvalue = value;
                    if (kichide.length> 1  || !instance.#isPrimitive(boundvalue))
                        boundvalue = instance.#getValueByPath(t.path);

                    t.element.style.display = boundvalue ? "none" : "";               
                });

                const kicshow = instance.#domDictionary.filter(p=>p.kictype==="oneway" && ((instance.#isPrimitive(value) && (p.path===path)) || p.path!=="") && p.directive==='kic-show');
                kicshow.forEach(t=>
                {
                    let boundvalue = value;
                    if (kichide.length> 1  || !instance.#isPrimitive(boundvalue))
                        boundvalue = instance.#getValueByPath(t.path);

                    t.element.style.display = boundvalue ? "" : "none";
            
                });
           
        }

        /****** Interpolation ******/
        interpolate(this);
       
        /******* Element boinding ******/
        updateElements(path,value,this);

    }

   

    #getValueByPath(path) {
        const keys = path.match(/[^.[\]]+/g);
        let target = this.#appDataProxy;
    
        // Loop with for (faster than forEach)
        for (let i = 0; i < keys.length; i++) {
            if (i === 0 && keys[i].toLowerCase() === 'kic') continue; // Skip 'kic' only if it's the first key
            if (!target) return undefined; // Exit early if target becomes null/undefined
            target = target[keys[i]];
        }
    
        return target;
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

    #getClosestAttribute(element, name)
    {
        let idx = element.getAttribute(name);
        let p = element.parentElement;
        let safecnt=0;
        while (!idx && p)
        {
            safecnt++;
            idx = p.getAttribute('kic-index');
            p=p.parentElement;
            if (safecnt>100)
                break;
        }

        return idx || "";
    
    }
                   
      
    

   
    
}
