// Define that Window can have ZAFClient
declare global {
    interface Window {
        ZAFClient: any;
    }
}

let client: any = null;

if (typeof window.ZAFClient !== 'undefined') {
    client = window.ZAFClient.init();
}

export { client };

// src/zaf.ts
// ... imports and client init ...

export const openModal = () => {
    if (!client) return;
    client.invoke('instances.create', {
        location: 'modal',
        url: 'assets/index.html?mode=modal',
        size: {
            width: '800px',  // <--- UPDATED
            height: '900px'  // <--- UPDATED
        }
    });
};