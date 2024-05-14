export class RBValidationError extends Error {
    constructor(args){
        super(args);
        this.name = 'RBValidationError';
    }
}
