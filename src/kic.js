
function getKICApp(appelement){
    return new KicApp(appelement);
}

class KicApp {

    #appElement; 
    #appData; 
    #appDataProxy; 

    constructor(e) {
        this.#appElement = e;
    }

    mount(m) {
        this.#appData = m;
        this.#appDataProxy = this.#reactive((key, value) => { this.#updateDOM(key, value) }, m);
        this.#bindInputs();
        Object.keys(this.#appDataProxy).forEach(key => this.#updateDOM(key, this.#appDataProxy[key]));
    }

    #reactive(callback, data) {
        return new Proxy(data, {
            get: (target, key) => target[key],
            set: (target, key, value) => {
                target[key] = value;
                callback(key, value);  // Notify DOM update
                return true;
            }
        });
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
        // Update input elements
        this.#appElement.querySelectorAll(`[kic-bind="${key}"]`).forEach(el => {
            if (el.type === "checkbox") {
                el.checked = value;
            } else if (el.type === "radio") {
                el.checked = el.value === value;
            } else {
                el.value = value;
            }
        });
      
        this.#interpolateDOM();
    }

    #interpolateDOM() {
        // Find all elements with text content containing {{key}}
        this.#appElement.querySelectorAll('*').forEach(el => {
            const elementsToUpdate = el.childNodes;
            elementsToUpdate.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    let newText = node.textContent.replace(/\{\{\s*([\w]+)\s*\}\}/g, (match, key) => {
                        // Use the key from the proxy to replace the placeholder
                        return this.#appDataProxy[key] !== undefined ? this.#appDataProxy[key] : match;
                    });

                    if (newText !== node.textContent) {
                        node.textContent = newText; // Update the text content
                    }
                }
            });
        });
    }
}
