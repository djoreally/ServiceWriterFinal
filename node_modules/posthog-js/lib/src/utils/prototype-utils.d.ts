/**
 * Also adapted from https://github.com/PostHog/rrweb/blob/804380afbb1b9bed70b8792cb5a25d827f5c0cb5/packages/utils/src/index.ts#L31
 * after a number of performance reports from Angular users
 */
import { AssignableWindow } from './globals';
interface NativeImplementationsCache {
    MutationObserver: typeof MutationObserver;
}
export declare function getNativeImplementation<T extends keyof NativeImplementationsCache>(name: T, assignableWindow: AssignableWindow): NativeImplementationsCache[T];
export declare function getNativeMutationObserverImplementation(assignableWindow: AssignableWindow): typeof MutationObserver;
export {};
