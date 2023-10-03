export type GenericTraps = {
    [key: string]: any;
};
export type RequestLike = {
    method: string;
    url: string;
} & GenericTraps;
export type IRequestStrict = {
    method: string;
    url: string;
    route: string;
    params: {
        [key: string]: string;
    };
    query: {
        [key: string]: string | string[] | undefined;
    };
    proxy?: any;
} & Request;
export type IRequest = IRequestStrict & GenericTraps;
export type RouterOptions = {
    base?: string;
    routes?: RouteEntry[];
};
export type RouteHandler<I = IRequest, A extends any[] = any[]> = {
    (request: I, ...args: A): any;
};
export type RouteEntry = [string, RegExp, RouteHandler[], string];
export type Route = <RequestType = IRequest, Args extends any[] = any[], RT = RouterType>(path: string, ...handlers: RouteHandler<RequestType, Args>[]) => RT;
export type UniversalRoute<RequestType = IRequest, Args extends any[] = any[]> = (path: string, ...handlers: RouteHandler<RequestType, Args>[]) => RouterType<UniversalRoute<RequestType, Args>, Args>;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
export type CustomRoutes<R = Route> = {
    [key: string]: R;
};
export type RouterType<R = Route, Args extends any[] = any[]> = {
    __proto__: RouterType<R>;
    routes: RouteEntry[];
    handle: <A extends any[] = Args>(request: RequestLike, ...extra: Equal<R, Args> extends true ? A : Args) => Promise<any>;
    all: R;
    delete: R;
    get: R;
    head: R;
    options: R;
    patch: R;
    post: R;
    put: R;
} & CustomRoutes<R>;
export declare const Router: <RequestType = IRequest, Args extends any[] = any[], RouteType = Equal<RequestType, IRequest> extends true ? Route : UniversalRoute<RequestType, Args>>({ base, routes }?: RouterOptions) => RouterType<RouteType, Args>;
export {};
