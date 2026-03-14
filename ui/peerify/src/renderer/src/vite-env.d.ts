/// <reference types="svelte" />
/// <reference types="vite/client" />

declare module "*.svelte" {
    import type { Component } from "svelte";
    const component: Component;
    export default component;
}

declare module '*.png' {
    const value: string;
    export default value;
}

declare module '*.jpg' {
    const value: string;
    export default value;
}

declare module '*.jpeg' {
    const value: string;
    export default value;
}

declare module '*.svg' {
    const value: string;
    export default value;
}

declare module '*.webp' {
    const value: string;
    export default value;
}

interface Window {
    peerifyAPI: any;
    electron: any;
    _peerify_cleanup?: any;
}
