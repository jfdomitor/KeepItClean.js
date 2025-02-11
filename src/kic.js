
function getKICApp(data){
    return new KicApp(data);
}

class KicApp {

    #appElement; 
    #appData; 
    #appDataProxy; 
    #interpolatedElements = []; 
    #foreachTemplates = []; 
    #inputBindings = []; 
    #eventHandlers = {};

    constructor(data) {
        this.#appData = data;
    }

    mount(element) 
    {
      
        this.#appElement = element;
        this.#appDataProxy = this.#createReactiveProxy((path, value) => { 
            this.#updateDOMOnChange(path, value);  // Update DOM elements like inputs
            this.#interpolateDOM();  // Update interpolation after data change
        }, this.#appData);
        this.#collectInputBindings();
        this.#bindInputs();
        this.#collectForEachTemplates(); 
        this.#bindForEach();
        this.#refreshDOMFromData(this.#appDataProxy, 'kic');
        this.#collectInterpolatedElements(); // Collect all interpolated elements on load
        this.#interpolateDOM();  // Initial interpolation on page load
        this.#bindClickEvents();
    }

    getData()
    {
        return this.#appDataProxy;
    }

    addHandler(functionName, handlerFunction) {
        if (typeof handlerFunction === "function") {
            this.#eventHandlers[functionName] = handlerFunction;
        } else {
            console.warn(`Handler for "${functionName}" is not a function.`);
        }
    }

  
    #createReactiveProxy(callback, data, currentPath = "kic") {
        const handler = {
            get: (target, key) => {
                const value = target[key];
                const newPath = Array.isArray(target) ? `${currentPath}[${key}]` : `${currentPath}.${key}`;

                // If it's an object or array, make it reactive too
                if (Array.isArray(value)) {
                    return this.#createArrayProxy(callback, value,newPath);
                }
                if (typeof value === 'object' && value !== null) {
                    return this.#createReactiveProxy(callback, value, newPath); // Recursively create a proxy
                }
                return value;
            },
            set: (target, key, value) => {
                target[key] = value;
                const path = Array.isArray(target) ? `${currentPath}[${key}]` : `${currentPath}.${key}`;
                callback(path, value);
                return true;
            }
        };
        
        return new Proxy(data, handler);
    }
    
    #createArrayProxy(callback, array, path = "") {
        const arrayHandler = {
            get: (target, key) => {
                if (['push', 'pop', 'splice', 'shift', 'unshift'].includes(key)) {
                    return (...args) => {
                        const result = Array.prototype[key].apply(target, args);
                        callback(path, target); // Trigger DOM update on array changes
                        return result;
                    };
                }
                return target[key];
            },
            set: (target, key, value) => {
                target[key] = value;
                callback(path, target); // Update DOM when an index is modified
                return true;
            }
        };
        
        return new Proxy(array, arrayHandler);
    }
    


    #collectInputBindings() {
        const inputs = this.#appElement.querySelectorAll("[kic-bind]");
        inputs.forEach(el => {

            let isValid = true;

            const bindingpath = el.getAttribute("kic-bind");
            if (!bindingpath)
                isValid=false;
            if (!bindingpath.includes('.'))
                isValid=false;

            const isDuplicate = this.#inputBindings.some(item => 
                item.element === el && item.path === bindingpath
            );

            if (!isDuplicate && isValid)
                this.#inputBindings.push({element: el, path:bindingpath});


        });
    }

    #bindInputs() {
      
        this.#inputBindings.forEach(item => {

            item.element.addEventListener("input", (event) => {

                const keys = item.path.split('.');
                let valuekey = null;
                let target=null;
                keys.forEach(key => {
                    if (key.toLowerCase()!=='kic')
                    {
                        if (typeof this.#appDataProxy[key] === 'object') 
                            target = this.#appDataProxy[key];

                            valuekey=key;
                    }
    
                });
    
                if (!valuekey)
                    return;
                if (!target)
                    return;


                if ( item.element.type === "checkbox") 
                {
                    target[valuekey] =  item.element.checked;
                } 
                else if ( item.element.type === "radio") 
                {
                    if ( item.element.checked)
                        target[valuekey] =  item.element.value;
                } 
                else 
                {
                    target[valuekey] =  item.element.value;
                }
            });
        });
    }

    #collectForEachTemplates() 
    {
        this.#appElement.querySelectorAll("[kic-foreach]").forEach(template => {

            const expr = template.getAttribute("kic-foreach"); // "cars"
            const parent = template.parentElement;
            const tagname = template.localName;
            const html = this.#cleanWhitespace(template.innerHTML);
            let isValid=true;

            if (!expr)
                isValid=false;
            if (!tagname)
                isValid=false;
            if (!html)
                isValid=false;
            if (!parent)
                isValid=false;

            const isDuplicate = this.#foreachTemplates.some(item => 
                item.parentElement === parent && item.expression === expr
            );

            if (!isDuplicate && isValid)
            {
                this.#foreachTemplates.push({parentElement: parent, expression:expr, templateTagName: tagname, templateHTML: html});
                template.remove();
            }
            
        });
    }

    #bindForEach() {

        let updateInterpolations = false;
        this.#foreachTemplates.forEach(template => {


            let [itemName, arrayName] = template.expression.split(" in ").map(s => s.trim());
            template.parentElement.innerHTML = ""; // Clear list
            const foreachArray = this.#getValueByPath(arrayName);
            let counter=0;
            foreachArray.forEach(item => {
                const newtag = document.createElement(template.templateTagName);
                let exprlist = this.#getInterpolations(template.templateHTML);
                if (exprlist.length>0)
                {
                    /*

                        Regex Breakdown
                        {{([^}]*) → Captures everything before itemName inside {{ ... }}

                        \\b${itemName}\\b → Finds itemName as a whole word

                        ([^}]*)}} → Captures everything after itemName inside {{ ... }}

                        Final Match: {{ before itemName after }}
                        
                        Replace Logic
                        Keeps before and after unchanged
                        Replaces itemName with arrayName[index]

                    */
                    let regex = new RegExp(`{{([^}]*)\\b${itemName}\\b([^}]*)}}`, "g");
                    newtag.innerHTML = template.templateHTML.replace(regex, (match, before, after) => {
                        return `{{${before}${arrayName}[${counter}]${after}}}`;
                    });
                    
                    updateInterpolations=true;
                }
                else{
                     newtag.innerHTML = template.templateHTML;
                }

                newtag.dataset.kicPath = `${arrayName}[${counter}]`;
                newtag.dataset.kicIndex = counter;
                template.parentElement.appendChild(newtag);
                counter++;
            });
           
        });

        if (updateInterpolations)
            this.#collectInterpolatedElements();
    }

    

    #bindClickEvents() {
        this.#appElement.querySelectorAll("[kic-click]").forEach(el => {
            const expression = el.getAttribute("kic-click").trim();

            
            // Check if the event is already bound
            if (el.dataset.kicClickBound) return; 

            let match = expression.match(/^(\w+)\((.*?)\)$/);
            if (match) {
                let functionName = match[1];  // Function name (e.g., handleDeleteCar)
                let argExpression = match[2]; // Arguments inside parentheses (e.g., car)

                el.addEventListener("click", (event) => {
                    // Resolve arguments dynamically
                    let arglist = argExpression.split(",").map(arg => arg.trim()); // Split multiple arguments
                    let args = arglist.map(arg => {
                        if (arg === "event") 
                            return event; // Allow `event` as a parameter

                        return ""; // Resolve object references
                    });
                    
                    // Call the function from the handlers object
                    if (this.#eventHandlers[functionName]) {
                        this.#eventHandlers[functionName].apply(this.#appDataProxy, args);
                    } else {
                        console.warn(`Handler function '${functionName}' not found.`);
                    }
                });

                 // Mark the element as bound
                 el.dataset.kicClickBound = "true";  

            } else {
                console.warn(`Invalid kic-click expression: ${expression}`);
            }
        
    
           
        });
    }
    
    

    
    

    #refreshDOMFromData(obj, path)
    {
        Object.keys(obj).forEach(key => {
          
            let tempobj = obj[key];
            if (tempobj !== undefined && tempobj !== null){
                if (typeof tempobj !== 'object')
                {
                    this.#updateDOMOnChange(path+'.'+key, tempobj);
                }
                else
                {
                    this.#refreshDOMFromData(tempobj, path+'.'+key);
                }
            }
        });
    }

    #updateDOMOnChange(path, value) {
        this.#appElement.querySelectorAll(`[kic-bind="${path}"]`).forEach(el => {
            if (Array.isArray(value)) {
                el.innerHTML = value.map(item => `<li>${item}</li>`).join('');
            } else if (el.type === "checkbox") {
                el.checked = value;
            } else if (el.type === "radio") {
                el.checked = el.value === value;
            } else {
                el.value = value;
            }
        });
    
        // Detect if this update affects a kic-foreach template
        this.#foreachTemplates.forEach(template => {
            if (template.expression.includes(path)) {
                this.#bindForEach(); // Rerun the binding to re-render elements
            }
        });
    
        this.#appElement.querySelectorAll(`[kic-hide="${path}"]`).forEach(el => {
            el.style.display = value ? "none" : "";
        });
    
        this.#appElement.querySelectorAll(`[kic-show="${path}"]`).forEach(el => {
            el.style.display = value ? "" : "none";
        });
    }
    

        
    

    
    
    #collectInterpolatedElements() {
        // Collect all elements containing interpolation expressions
        const elements = this.#appElement.querySelectorAll('*');
    
        elements.forEach(el => {
            if (el.childNodes.length) {
                el.childNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const expressions = this.#getInterpolations(node.textContent);
                        
                        if (expressions.length > 0) {
                            // Check if the element is already in the list
                            const isDuplicate = this.#interpolatedElements.some(item => 
                                item.element === el && item.node === node
                            );
    
                            if (!isDuplicate) {
                                this.#interpolatedElements.push({
                                    element: el,
                                    node,
                                    originalText: node.textContent,
                                    expressions
                                });
                            }
                        }
                    }
                });
            }
        });
    }
    


    #interpolateDOM() {

       if (this.#interpolatedElements.length===0)
            return;

       this.#interpolatedElements.forEach(({ element, node, originalText, expressions }) => {
            const nodetext = this.#updateInterpolations(originalText, this.#appDataProxy);
            node.textContent = nodetext;

       });

    }

    #getValueByPath(path) {
        // Match "cars[0]" or "cars[1].brand"
        const keys = path.match(/[^.[\]]+/g);
        let target = this.#appDataProxy;
    
        keys.forEach(key => {
            if (key.toLowerCase() !== 'kic') {
                if (target) target = target[key];
            }
        });
    
        return target;
    }


    #cleanWhitespace(html) 
    {
        return html
            .replace(/>\s+</g, '><')  // Remove spaces between tags
            .replace(/(\S)\s{2,}(\S)/g, '$1 $2'); // Reduce multiple spaces to one inside text nodes
    }

    #getInterpolations(str) {
        const regex = /{{(.*?)}}/g;
        let matches = [];
        let match;
    
        while ((match = regex.exec(str)) !== null) {
            matches.push(match[1].trim()); // Trim spaces inside {{ }}
        }
    
        return matches;
    }

    #updateInterpolations(str, context = {}) {
        return str.replace(/{{(.*?)}}/g, (_, expression) => {
            try 
            {

                // Trim the expression to remove extra spaces
                expression = expression.trim();
    
                // If the expression is just the variable name (e.g., `kic`), return the full context of it
                if (expression.toLowerCase()=='kic') {
                    return JSON.stringify(context);
                }

                if (expression.toLowerCase().includes('kic.'))
                {
                    let regex = new RegExp('kic.', "g");
                    expression = expression.replace(regex, '');
                }
    
                //console.log("Context Keys:", Object.keys(context));
                //console.log("Context Values:", Object.values(context));
                //console.log("Expression:", expression);

                const functionBody = `return ${expression}`;
                //console.log("Generated Function Body:", functionBody);

                // Use the Function constructor to evaluate the expression dynamically
                let result = new Function(...Object.keys(context), functionBody)(...Object.values(context));

                //console.log("Result:", result);
    
                // If the result is an object, convert it to JSON string for better display
                return typeof result === "object" ? JSON.stringify(result) : result;

            } catch (error) {
                expression='kic.'+expression;
                //console.warn(`Error evaluating: {{${expression}}}`, error);
                return `{{${expression}}}`; // Keep the original interpolation if an error occurs
            }
        });
    }

    //Generates a flat object from any object
    #getObjectDictionary(obj, parentKey = '') {
        let result = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = parentKey ? `${parentKey}.${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (Array.isArray(obj[key])) {
                        result[newKey] = obj[key]; 
                        obj[key].forEach((item, index) => {
                            result[`${newKey}[${index}]`] = item; 
                            Object.assign(result, this.#getObjectDictionary(item, `${newKey}[${index}]`));
                        });
                    } else {
                        result[newKey] = obj[key]; 
                        Object.assign(result, this.#getObjectDictionary(obj[key], newKey));
                    }
                } else {
                    result[newKey] = obj[key];  
                }
            }
        }
    
        return result;
    }
    
    
    
}
