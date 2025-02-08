
class KicApp {

    #appElement; 
    #pageData; 

    constructor(e) {
        this.#appElement=e;
    }

    mount(m) 
    {
        this.#pageData = this.#reactive(m);
        this.#bindInputs();
        Object.keys(this.#pageData ).forEach(key => this.#updateDOM(key, this.#pageData [key]));
    }

    #reactive(obj) {
        return new Proxy(obj, {
            get(target, key) {
                return target[key];
            },
            set(target, key, value) {
                target[key] = value;
                this.parent.#updateDOM(key, value);
                return true;
            }
        });
    }

    #bindInputs() 
    {

        this.#appElement.querySelectorAll("[kic-bind]").forEach(el => {
            const key = el.getAttribute("kic-bind");
            el.addEventListener("input", (event) => {
                if (el.type === "checkbox") {
                    this.#pageData[key] = el.checked;
                } else if (el.type === "radio") {
                    if (el.checked) this.#pageData[key] = el.value;
                } else {
                    this.#pageData[key] = el.value;
                }
            });
        });
    }

    #updateDOM(key, value) 
    {
        this.#appElement.querySelectorAll(`[v-model="${key}"]`).forEach(el => {
            if (el.type === "checkbox") {
                el.checked = value;
            } else if (el.type === "radio") {
                el.checked = el.value === value;
            } else {
                el.value = value;
            }
        });
    
        // Update displayed values
        const displayEl = document.getElementById(`${key}Display`);
        if (displayEl) {
            displayEl.innerText = typeof value === "boolean" ? (value ? "Yes" : "No") : value;
        }
    }


}
