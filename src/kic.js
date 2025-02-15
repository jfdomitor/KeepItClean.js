
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

          
            //this.#renderTemplates(path, value, key);   
            //this.#setupBindings(path);
            //this.#applyProxyChangesToDOM(path, value);

        }, this.#appData);

       
        this.#buildDomDictionary(this.#appElement);
        this.#renderTemplates('kic', this.#appDataProxy, 'init');
        this.#setupBindings('kic');
        this.#applyProxyChangesToDOM('kic', this.#appDataProxy);

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
    


   
    #buildDomDictionary(element)
    {
        const tag = element || this.#appElement;

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
  

    #setupBindings(path) 
    {
        if (!path)
            throw new error('#setupBindings was called without a path');

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

    // #setupTemplates() 
    // {
    //     this.#appElement.querySelectorAll("[kic-foreach]").forEach(template => {

    //         const expr = template.getAttribute("kic-foreach"); 
    //         const parent = template.parentElement;
    //         const tagname = template.localName;
    //         const html = this.#cleanWhitespace(template.innerHTML);
    //         let isValid=true;

    //         if (!expr)
    //             isValid=false;
    //         if (!tagname)
    //             isValid=false;
    //         if (!html)
    //             isValid=false;
    //         if (!parent)
    //             isValid=false;

    //         const isDuplicate = this.#foreachTemplates.some(item => 
    //             item.parentElement === parent && item.expression === expr
    //         );

    //         if (!isDuplicate && isValid)
    //         {
    //             let [varName, arrayName] = expr.split(" in ").map(s => s.trim());
    //             this.#foreachTemplates.push({parentElement: parent, expression:expr, templateTagName: tagname, templateHTML: html, path: arrayName, foreachVarName: varName });
    //             template.remove();
    //         }
            
    //     });
    // }

    #renderTemplates(path, array, operation) 
    {

        let foreacharray = [];

        if (!path)
            throw new Error('renderTemplates was called without path');
  
        if (path.includes('['))
            return; //throw new Error('renderTemplates was called with an object in the array');

        let isSinglePush = operation === "push";
        let templates = [];
        if (path.toLowerCase()==='kic')
            templates = this.#domDictionary.filter(p=> p.kictype==='template');
        else
            templates = this.#domDictionary.filter(p=> p.path===path &&  p.kictype==='template');

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
                this.#removeFromDomDictionary(template.element);
                template.element.innerHTML = ""; // Clear list
            }
            else
            {
                counter = foreacharray.length-1;
                foreacharray = foreacharray.arr.slice(-1);
            }

        
            foreacharray.forEach(item => {
                const newtag = document.createElement(template.templateTagName);
                newtag.innerHTML = template.templateMarkup;
                newtag.setAttribute("kic-varname", varname);
                newtag.setAttribute("kic-path", `${datapath}[${counter}]`);
                newtag.setAttribute("kic-index", counter);
                newtag.dataset.kicIndex = counter;
                template.element.appendChild(newtag);

                this.#buildDomDictionary(newtag);
               
                //Add references to click handlers
                newtag.querySelectorAll("[kic-click]").forEach(el => 
                {
                    el.setAttribute("kic-varname", varname);
                    el.setAttribute("kic-path", `${datapath}[${counter}]`);
                    el.setAttribute("kic-index", counter);
                    this.#buildDomDictionary(el);
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
                    this.#buildDomDictionary(el);

                });

                counter++;

            });
           
        });
        
    }


    // #bindForEach() {

    //     let updateInterpolations = false;
    //     let updateInputBindings = false;
    //     let arraynames = [];
    //     this.#foreachTemplates.forEach(template => {


    //         let [itemName, arrayName] = template.expression.split(" in ").map(s => s.trim());
    //         template.parentElement.innerHTML = ""; // Clear list
    //         const foreachArray = this.#getValueByPath(arrayName);
    //         let counter=0;
    //         foreachArray.forEach(item => {
    //             const newtag = document.createElement(template.templateTagName);
    //             let exprlist = this.#getInterpolationPaths(template.templateHTML);
    //             if (exprlist.length>0 && this.#enableInterplation)
    //             {
    //                 /*

    //                     Regex Breakdown
    //                     {{([^}]*) → Captures everything before itemName inside {{ ... }}

    //                     \\b${itemName}\\b → Finds itemName as a whole word

    //                     ([^}]*)}} → Captures everything after itemName inside {{ ... }}

    //                     Final Match: {{ before itemName after }}
                        
    //                     Replace Logic
    //                     Keeps before and after unchanged
    //                     Replaces itemName with arrayName[index]

    //                 */
    //                 let regex = new RegExp(`{{([^}]*)\\b${itemName}\\b([^}]*)}}`, "g");
    //                 newtag.innerHTML = template.templateHTML.replace(regex, (match, before, after) => {
    //                     return `{{${before}${arrayName}[${counter}]${after}}}`;
    //                 });
                    
    //                 updateInterpolations=true;
                   
    //             }
    //             else{
    //                  newtag.innerHTML = template.templateHTML;
    //             }

    //             arraynames.push(arrayName);

    //             newtag.setAttribute("kic-varname", itemName);
    //             newtag.setAttribute("kic-path", `${arrayName}[${counter}]`);
    //             newtag.setAttribute("kic-index", counter);
    //             newtag.dataset.kicIndex = counter;
    //             template.parentElement.appendChild(newtag);
              

    //             //Add references to click andlers
    //             newtag.querySelectorAll("[kic-click]").forEach(el => 
    //             {
    //                 el.setAttribute("kic-varname", itemName);
    //                 el.setAttribute("kic-path", `${arrayName}[${counter}]`);
    //                 el.setAttribute("kic-index", counter);
    //             });

    //              //Add references to input bindings
    //              newtag.querySelectorAll("[kic-bind]").forEach(el => 
    //             {
    //                     updateInputBindings=true;
    //                     el.setAttribute("kic-varname", itemName);
    //                     el.setAttribute("kic-path", `${arrayName}[${counter}]`);
    //                     el.setAttribute("kic-index", counter);
    //                     let attrib = el.getAttribute("kic-bind");
    //                     if (!attrib.includes(itemName))
    //                         console.warn(`Error The input binding ${attrib} used in an element under kic-foreach does not match the kic-foreach expression, should include '${itemName}'`);

    //                     el.setAttribute("kic-bind", attrib.replace(itemName,`${arrayName}[${counter}]`));
    //                 });

    //             counter++;

                
    //         });
           
    //     });

    //     if (updateInputBindings)
    //     {
    //             arraynames.forEach(name=>{
    //                 this.#inputBindings = this.#inputBindings.filter(p=> !p.path.includes(name));
    //             });
             
    //             this.#collectInputBindings();
    //     }

    //     if (updateInterpolations && this.#enableInterplation)
    //     {
    //         arraynames.forEach(name=>{
    //             this.#interpolatedElements = this.#interpolatedElements.filter(p=> !p.path.includes(name));
    //         });

    //         this.#collectInterpolatedElements();
    //     }
    // }

   

    // #bindClickEvents(element) 
    // {
    //     if (!element)
    //         element= this.#appElement;

    //     element.querySelectorAll("[kic-click]").forEach(el => {
    //         const expression = el.getAttribute("kic-click").trim();

            
    //         // Check if the event is already bound
    //         if (el.dataset.kicClickBound) return; 

    //         let match = expression.match(/^(\w+)\((.*?)\)$/);
    //         if (match) {
    //             let functionName = match[1];  // Function name (e.g., handleDeleteCar)
    //             let argExpression = match[2]; // Arguments inside parentheses (e.g., car)

    //             el.addEventListener("click", (event) => {
    //                 // Resolve arguments dynamically
    //                 let arglist = argExpression.split(",").map(arg => arg.trim()); // Split multiple arguments
    //                 let args = arglist.map(arg => {
    //                     if (arg === "event") 
    //                         return event; // Allow `event` as a parameter

    //                     const path = event.target.getAttribute("kic-path"); 
    //                     if (path)
    //                     {
    //                         const varname = event.target.getAttribute("kic-varname"); 
    //                         if (arg!=varname)
    //                         {
    //                               console.warn(`Error The variable ${arg} used in ${functionName} does not match the kic-foreach expression, should be '${varname}'`);
    //                         }
    //                         return this.#getValueByPath(path);
    //                     }
    //                     else
    //                        return this.#getValueByPath(arg);

    //                 });
                    
    //                 // Call the function from the handlers object
    //                 if (this.#eventHandlers[functionName]) {
    //                     this.#eventHandlers[functionName].apply(this, args);
    //                 } else {
    //                     console.warn(`Handler function '${functionName}' not found.`);
    //                 }
    //             });

    //              // Mark the element as bound
    //              el.dataset.kicClickBound = "true";  

    //         } else {
    //             console.warn(`Invalid kic-click expression: ${expression}`);
    //         }
        
    
           
    //     });
    // }

   
    
    #applyProxyChangesToDOM(path, value) 
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
                
                    let exprvalue = instance.#getValueByPath(expr);
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

    // #applyProxyChangesToDOM(path, value) 
    // {
    //     if (!this.#isPrimitive(value))
    //     {
    //         Object.keys(value).forEach(key => {
    //             let tempobj = value[key];
    //             if (tempobj !== undefined && tempobj !== null) {
    //                 // Detect numeric keys (array indices) and format path correctly
    //                 const newPath = Array.isArray(value) && /^\d+$/.test(key) 
    //                     ? `${path}[${key}]` 
    //                     : `${path}.${key}`;
        
    //                 this.#applyProxyChangesToDOM(newPath, tempobj);
    //             }
    //         });
    //     }

    //     const log = this.#getConsoleLog(2);
    //     if (log.active)
    //         console.log(log.name, path, value);



    //     this.#appElement.querySelectorAll(`[kic-bind="${path}"]`).forEach(el => 
    //     {
    //         if (!Array.isArray(value) && ! (typeof value === 'object')) {
    //             if (el.type === "checkbox") {
    //                 el.checked = value;
    //             } else if (el.type === "radio") {
    //                 el.checked = el.value === value;
    //             } else {
    //                 el.value = value;
    //             }
    //         } 
            
    //     });
    
       
    //     this.#appElement.querySelectorAll(`[kic-hide="${path}"]`).forEach(el => {
    //         el.style.display = value ? "none" : "";
    //     });
    
    //     this.#appElement.querySelectorAll(`[kic-show="${path}"]`).forEach(el => {
    //         el.style.display = value ? "" : "none";
    //     });
    // }
    

        
    

    
    
    // #collectInterpolatedElements(element) 
    // {

    //     // Collect all elements containing interpolation expressions
    //     let elements = [];
    //     if (!element)
    //         elements = this.#appElement.querySelectorAll('*');
    //     else
    //         elements = element.querySelectorAll('*');
    
    //     elements.forEach(el => {
    //         if (el.childNodes.length) {
    //             el.childNodes.forEach(node => {
    //                 if (node.nodeType === Node.TEXT_NODE) {
    //                     const expressions = this.#getInterpolationPaths(node.textContent);
                        
    //                     if (expressions.length > 0) {
    //                         // Check if the element is already in the list
    //                         // console.log("Checking element:", el, "node:", node);
    //                         // console.log("Current list:", this.#interpolatedElements);
    //                         const isDuplicate = this.#interpolatedElements.some(item => 
    //                             item.element === el && item.node === node
    //                         );
    //                         // console.log("Is duplicate?", isDuplicate);

    //                         //Check if this interpolation was created after the mount of kic
    //                         let foreachpath = el.getAttribute('kic-path');
    //                         let p = el.parentElement;
    //                         let safecnt=0;
    //                         while (!foreachpath && p)
    //                         {
    //                             safecnt++;
    //                             foreachpath = p.getAttribute('kic-path');
    //                             p=p.parentElement;
    //                             if (safecnt>10)
    //                                 break;
    //                         }
    //                         if (!foreachpath)
    //                             foreachpath="";
    
    //                         if (!isDuplicate) {
    //                             this.#interpolatedElements.push({
    //                                 element: el,
    //                                 node,
    //                                 originalText: node.textContent,
    //                                 expressions,
    //                                 path: foreachpath
    //                             });
    //                         }
    //                     }
    //                 }
    //             });
    //         }
    //     });

    //     if (this.#enableInterpolation &&  this.#interpolatedElements.length == 0)
    //         this.enableInterpolation=true;
    // }
    


    // #interpolateDOM(path) 
    // {

    //    this.#interpolatedElements.forEach(({ element, node, originalText, expressions, path }) => {
            
    //     if (!interPolatedElement){
    //         const nodetext = this.#updateInterpolations(element, originalText, this.#appDataProxy);
    //         node.textContent = nodetext;
    //     }
    //     else
    //     {
    //         if (interPolatedElement===element)
    //         {
    //             const nodetext = this.#updateInterpolations(element, originalText, this.#appDataProxy);
    //             node.textContent = nodetext;
    //         }
    //     }

    //    });

    // }

    // #getValueByPath(path) {
    //     const keys = path.match(/[^.[\]]+/g);
    //     let target = this.#appDataProxy;
    //     keys.forEach(key => {
    //         if (key.toLowerCase() !== 'kic') {
    //             if (target) target = target[key];
    //         }
    //     });
    //     return target;
    // }

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


    // #cleanWhitespace(html) 
    // {
    //     return html
    //         .replace(/>\s+</g, '><')  // Remove spaces between tags
    //         .replace(/(\S)\s{2,}(\S)/g, '$1 $2'); // Reduce multiple spaces to one inside text nodes
    // }

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

    // #updateInterpolations(element, str, context = {}) {

    //     return str.replace(/{{(.*?)}}/g, (_, expression) => {
    //         try 
    //         {
    //             expression = expression.trim();
    
    //             //If it's the root
    //             if (expression.toLowerCase()=='kic') {
    //                 return JSON.stringify(context);
    //             }

    //             //Index (Allowed as interpolation in kic-foreach)
    //             if (expression.toLowerCase()=='index' && element) 
    //             {
    //                 let idx = element.getAttribute('kic-index');
    //                 let p = element.parentElement;
    //                 let safecnt=0;
    //                 while (!idx && p)
    //                 {
    //                     safecnt++;
    //                     idx = p.getAttribute('kic-index');
    //                     p=p.parentElement;
    //                     if (safecnt>100)
    //                         break;
    //                 }
    //                 if (idx)
    //                     return idx;
    //             }

    //             if (expression.toLowerCase().startsWith('kic.'))
    //                 expression = expression.replace('kic.', '');
                

    //             const functionBody = `return ${expression}`;

    //             // Use the Function constructor to evaluate the expression dynamically
    //             let result = new Function(...Object.keys(context), functionBody)(...Object.values(context));

    //             // If the result is an object, convert it to JSON string for better display
    //             return typeof result === "object" ? JSON.stringify(result) : result;

    //         } catch (error) {
    //             expression='kic.'+expression;
    //             return `{{${expression}}}`; // Keep the original interpolation if an error occurs
    //         }
    //     });
    // }

 
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
