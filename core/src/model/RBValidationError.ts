export class RBValidationError extends Error {
    static clName = 'RBValidationError';
    constructor(args){
        super(args);
        this.name = RBValidationError.clName;
    }

    static isRBValidationError(err) {
        return RBValidationError.clName == err.name;
    }
}
