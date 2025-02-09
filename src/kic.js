
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

        const flatappdata = this.#flattenObject(this.#appDataProxy);

        var expressions = [];
        this.#interpolatedElements.forEach(({ element, node, originalText }) => {
            const elexp = originalText.match(/\{\{(.*?)\}\}/g);
            elexp.forEach((obj, key) => { expressions.push(obj); });
        });

        if (expressions) {
            expressions.forEach(expression => {
                var expr = expression.replace(/\{\{\s*|\s*\}\}/g, '');
                this.#interpolatedElements.forEach(({ element, node, originalText }) => {
                    if (originalText.includes(expr))
                    {
                        const data = flatappdata[expr];
                        var value_to_print = "";

                        if (Array.isArray(data)) {
                            value_to_print = `${JSON.stringify(data, null, 2)}`;
                        }else if (typeof data === 'object' && data !== null) {
                            value_to_print = `${JSON.stringify(data, null, 2)}`;
                        }else{
                            value_to_print = data;
                        }

                
                        if (value_to_print !== node.textContent) {
                            node.textContent = value_to_print;
                        }

                        
                    }

                });

            });
        }

        // Update each interpolated element dynamically based on the current app data
        // this.#interpolatedElements.forEach(({ element, node, originalText }) => {
        //     let newText = originalText.replace(/\{\{\s*kic(\.(\w+(\[\d+\])?)?)?\s*\}\}/g, (match, path) => {
        //         if (!path) {
        //             // If the path is just 'kic', return the whole appDataProxy as pretty-printed JSON
        //             return `${JSON.stringify(this.#appDataProxy, null, 2)}`;
        //         }

        //         const value = this.#getNestedValue(path);

        //         if (Array.isArray(value)) {
        //             // If it's an array, format it nicely (display the whole array)
        //             return `${JSON.stringify(value, null, 2)}`;
        //         } else if (typeof value === 'object') {
        //             // If it's an object, pretty print it
        //             return `${JSON.stringify(value, null, 2)}`;
        //         } else if (typeof value !== 'undefined') {
        //             // If it's a primitive value, just show it
        //             return value;
        //         }

        //         return match;  // If not found, return the original string
        //     });

        //     // Only update if the text has changed
        //     if (newText !== node.textContent) {
        //         node.textContent = newText;
        //     }
        // });
    }

    #flattenObject(obj, parentKey = '') {
        let result = {};
    
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                const newKey = parentKey ? `${parentKey}.${key}` : key;
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    if (Array.isArray(obj[key])) {
                        obj[key].forEach((item, index) => {
                            // If it's an array, we append the index to the key
                            Object.assign(result, this.#flattenObject(item, `${newKey}[${index}]`));
                        });
                    } else {
                        // It's an object, recurse into it
                        Object.assign(result, this.#flattenObject(obj[key], newKey));
                    }
                } else {
                    result[newKey] = obj[key];  // Directly assign the primitive value
                }
            }
        }
    
        return result;
    }
    
    
    
}
