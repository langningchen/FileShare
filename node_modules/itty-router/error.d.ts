interface ErrorLike extends Error {
    status?: number;
    [any: string]: any;
}
export type ErrorBody = string | object;
export interface ErrorFormatter {
    (statusCode?: number, body?: ErrorBody): Response;
    (error: ErrorLike): Response;
}
export declare const error: ErrorFormatter;
export {};
