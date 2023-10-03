export interface ResponseFormatter {
    (body?: any, options?: ResponseInit): Response;
}
export interface BodyTransformer {
    (body: any): string;
}
export declare const createResponse: (format?: string, transform?: BodyTransformer) => ResponseFormatter;
