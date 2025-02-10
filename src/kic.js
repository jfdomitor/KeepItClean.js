
function getKICApp(appelement){
    return new KicApp(appelement);
}

class KicApp {

    #appElement; 
    #appData; 
    #appDataProxy; 
    #interpolatedElements = []; 

    constructor(e) {
        this.#appElement = e;
    }

    mount(m) {
      
        this.#appData = m;
        this.#appDataProxy = this.#reactive((key, value) => { 
            this.#updateDOMOnChange(key, value);  // Update DOM elements like inputs
            this.#interpolateDOM();  // Update interpolation after data change
        }, m);
        this.#bindForEach();
        this.#bindInputs();
        this.#refreshDOMFromData(this.#appDataProxy, 'kic');
        this.#collectInterpolatedElements(); // Collect all interpolated elements on load
        this.#interpolateDOM();  // Initial interpolation on page load
    }

    getData()
    {
        return this.#appDataProxy;
    }

  
    #reactive(callback, data, currentPath = "kic") {
        const handler = {
            get: (target, key) => {
                const value = target[key];
                const newPath = Array.isArray(target) ? `${currentPath}[${key}]` : `${currentPath}.${key}`;

                // If it's an object or array, make it reactive too
                if (Array.isArray(value)) {
                    return this.#createArrayProxy(callback, value);
                }
                if (typeof value === 'object' && value !== null) {
                    return this.#reactive(callback, value, newPath); // Recursively create a proxy
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
    
    #createArrayProxy(callback, array) {
        const arrayHandler = {
            get: (target, key) => {
                if (key === 'push' || key === 'pop' || key === 'splice') {
                    return (...args) => {
                        const result = Array.prototype[key].apply(target, args);
                        callback(key, args);  // Trigger DOM update on array changes
                        return result;
                    };
                }
                return target[key];
            },
            set: (target, key, value) => {
                target[key] = value;
                callback(key, value);
                return true;
            }
        };
        
        return new Proxy(array, arrayHandler);
    }


    #bindInputs() {
        const inputs = this.#appElement.querySelectorAll("[kic-bind]");
        inputs.forEach(el => {

            const path = el.getAttribute("kic-bind");
            if (!path)
                return;
            if (!path.includes('.'))
                return;

            el.addEventListener("input", (event) => {

                const keys = path.split('.');
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


                if (el.type === "checkbox") 
                {
                    target[valuekey] = el.checked;
                } 
                else if (el.type === "radio") 
                {
                    if (el.checked)
                        target[valuekey] = el.value;
                } 
                else 
                {
                    target[valuekey] = el.value;
                }
            });
        });
    }

    #bindForEach() {
        this.#appElement.querySelectorAll("[kic-foreach]").forEach(template => {

            const expression = template.getAttribute("kic-foreach"); // "cars"
            let [itemName, arrayName] = expression.split(" in ").map(s => s.trim()); // Not used yet
            const parent = template.parentElement;
            const tag_to_create = template.localName;
    
            // Store original template & remove from DOM
            const templateHTML = template.innerHTML;
            template.remove();
    
            // Function to render items
            const renderList = () => {
                parent.innerHTML = ""; // Clear list
                const boundArray = this.#getValueByPath(arrayName);
                let counter=0;

                boundArray.forEach(item => {
                    const newtag = document.createElement(tag_to_create);

                    newtag.innerHTML = templateHTML.replace(itemName, arrayName+`[${counter}]`);

                    parent.appendChild(newtag);
                    counter++;
                });
            };
    
            // Initial render
            renderList();
    
            // // Make it reactive
            // this.#appDataProxy[arrayName] = new Proxy(this.#appDataProxy[arrayName] || [], {
            //     set: (target, prop, value) => {
            //         target[prop] = value;
            //         renderList(); // Update UI when array changes
            //         return true;
            //     }
            // });
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
                // Handle array rendering (e.g., rendering list items)
                el.innerHTML = value.map(item => `<li>${item}</li>`).join('');
            } else if (el.type === "checkbox") {
                el.checked = value;
            } else if (el.type === "radio") {
                el.checked = el.value === value;
            } else {
                el.value = value;
            }
        });

        this.#appElement.querySelectorAll(`[kic-hide="${path}"]`).forEach(el => {
           if (value){
                el.style.display = "none";
           }
           else
           {
                el.style.display = "";
           }
        });

        this.#appElement.querySelectorAll(`[kic-show="${path}"]`).forEach(el => {
            if (value){
                 el.style.display = "";
            }
            else
            {
                 el.style.display = "none";
            }
         });

        
    }

    
    
    #collectInterpolatedElements() {
        // Collect all elements containing interpolation expressions
        const elements = this.#appElement.querySelectorAll('*');
        elements.forEach(el => {
            if (el.childNodes.length) {
                el.childNodes.forEach(node => {
                    if (node.nodeType === Node.TEXT_NODE && /\{\{\s*[\w\.\[\]]+\s*\}\}/.test(node.textContent)) {
                        // Store element and the original text content
                        this.#interpolatedElements.push({ element: el, node, originalText: node.textContent });
                    }
                });
            }
        });
    }

    #interpolateDOM() {

       if (this.#interpolatedElements.length===0)
            return;

        let expressions = [];
        this.#interpolatedElements.forEach(({ element, node, originalText }) => {
            const elexp = originalText.match(/\{\{(.*?)\}\}/g);
            elexp.forEach((obj, key) => { expressions.push(obj); });
        });

        if (expressions.length>0) 
        {
            const flatappdata = this.#flattenAppData(this.#appDataProxy, 'kic');

            this.#interpolatedElements.forEach(({ element, node, originalText }) => {
                var value_to_print = originalText;
                expressions.forEach(expression => {

                    var expr = expression.replace(/\{\{\s*|\s*\}\}/g, '');

                    if (originalText.includes(expr))
                    {
                        const data = expr.toLowerCase() === 'kic' ? this.#appDataProxy : flatappdata[expr];
                        if (data)
                        {
                            value_to_print = value_to_print.replace(expression, 
                                typeof data === 'object' && data !== null ? JSON.stringify(data, null, 2) : data
                            );
                        }
                        
                    }

                });

                if (value_to_print && (value_to_print !== node.textContent)) {
                    node.textContent = value_to_print;
                }

            });
        }

    }

    #getValueByPath(path)
    {
        const keys = path.split('.');
        let target = this.#appDataProxy;
        keys.forEach(key => {
            if (key.toLowerCase()!=='kic')
            {
                if (target)
                    target = target[key];
            }
        });

        return target;
    }

    //Flattens any complex json object to a one level json
    #flattenAppData(obj, parentKey = '') {
        let result = {};
    
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = parentKey ? `${parentKey}.${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (Array.isArray(obj[key])) {
                        result[newKey] = obj[key]; 
                        obj[key].forEach((item, index) => {
                            result[`${newKey}[${index}]`] = item; 
                            Object.assign(result, this.#flattenAppData(item, `${newKey}[${index}]`));
                        });
                    } else {
                        result[newKey] = obj[key]; 
                        Object.assign(result, this.#flattenAppData(obj[key], newKey));
                    }
                } else {
                    result[newKey] = obj[key];  
                }
            }
        }
    
        return result;
    }
    
    
    
}
