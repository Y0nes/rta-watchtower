// src/zaf.ts
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

export const openModal = () => {
    if (!client) return;
    client.invoke('instances.create', {
        location: 'modal',
        url: 'assets/index.html?mode=modal',
        size: {
            width: '1600px', // <--- Widened to fit table comfortably
            height: '1000px'
        }
    });
};