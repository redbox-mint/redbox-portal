import { ILogger } from "../../src/Logger";

export const logger: ILogger = {
    blank(args: any): void {
    }, crit(args: any): void {
        console.error(args);
    }, debug(args: any): void {
        console.debug(args);
    }, error(args: any): void {
        console.error(args);
    }, fatal(args: any): void {
        console.error(args);
    }, info(args: any): void {
        console.info(args);
    }, log(args: any): void {
        console.log(args);
    }, silent(args: any): void {
    }, silly(args: any): void {
        console.debug(args);
    }, trace(args: any): void {
        console.trace(args);
    }, verbose(args: any): void {
        console.debug(args);
    }, warn(args: any): void {
        console.warn(args);
    }

}
