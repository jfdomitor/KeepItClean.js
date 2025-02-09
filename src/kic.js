
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
        this.#collectInterpolatedElements(); // Collect all interpolated elements on load
        this.#appData = m;
        this.#appDataProxy = this.#reactive((key, value) => { 
            this.#updateDOM(key, value);  // Update DOM elements like inputs
            this.#interpolateDOM();  // Update interpolation after data change
        }, m);
        this.#bindInputs();
        Object.keys(this.#appDataProxy).forEach(key => {
            this.#updateDOM(key, this.#appDataProxy[key]);
        });
        this.#interpolateDOM();  // Initial interpolation on page load
    }

    #reactive(callback, data) {
        const handler = {
            get: (target, key) => {
                const value = target[key];
                // If it's an object or array, make it reactive too
                if (Array.isArray(value)) {
                    return this.#createArrayProxy(callback, value);
                }
                if (typeof value === 'object' && value !== null) {
                    return this.#reactive(callback, value); // Recursively create a proxy
                }
                return value;
            },
            set: (target, key, value) => {
                target[key] = value;
                callback(key, value);
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

    #getNestedValue(path) {
        const keys = path.split('.');
        let value = this.#appDataProxy;
    
        for (let key of keys) {
            if (key.includes('[')) {
                // Handle array indices (e.g., kic.pets[0])
                const [arrKey, index] = key.split('[');
                const arrIndex = parseInt(index.replace(']', ''));
                value = value[arrKey] && value[arrKey][arrIndex];
            } else {
                // Access the value through the proxy (or the regular object if no proxy)
                value = value ? value[key] : undefined;
            }
    
            // If the value is undefined at any point, return undefined
            if (value === undefined) {
                return undefined;
            }
        }
    
        return value;
    }
    
    
    
    

    #bindInputs() {
        const inputs = this.#appElement.querySelectorAll("[kic-bind]");
        inputs.forEach(el => {
            const key = el.getAttribute("kic-bind");
            el.addEventListener("input", (event) => {
                if (el.type === "checkbox") {
                    this.#appDataProxy[key] = el.checked;
                } else if (el.type === "radio") {
                    if (el.checked) this.#appDataProxy[key] = el.value;
                } else {
                    this.#appDataProxy[key] = el.value;
                }
            });
        });
    }

    #updateDOM(key, value) {
        this.#appElement.querySelectorAll(`[kic-bind="${key}"]`).forEach(el => {
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
