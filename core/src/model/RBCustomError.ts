export class RBCustomError extends Error {
    constructor(args){
        super(args);
        this.name = 'RBCustomError';
    }
}