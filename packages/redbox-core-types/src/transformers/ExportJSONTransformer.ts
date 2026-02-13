import { Transform } from 'stream';
import { DateTime } from 'luxon';
import * as _ from 'lodash';

export class ExportJSONTransformer extends Transform {
    first: boolean = true;
    constructor(recordtype: string, modifiedBefore: string, modifiedAfter: string) {
        super();
        this.push(`{ "recordType": "${recordtype}",\n "dateGenerated": "${DateTime.now().toISO()}",\n`);
        if (!_.isEmpty(modifiedBefore) || !_.isEmpty(modifiedAfter)) {
            this.push(`"dateModifiedRange": ${this.getDateModifiedRangeObject(modifiedBefore, modifiedAfter)},\n`);
        }
        this.push(`"records":[ `);
    }

    private getDateModifiedRangeObject(modifiedBefore: string, modifiedAfter: string) {
        const rangeObject: Record<string, string> = {};
        if (!_.isEmpty(modifiedAfter)) {
            rangeObject["from"] = modifiedAfter;
        } else {
            rangeObject["from"] = "";
        }
        if (!_.isEmpty(modifiedBefore)) {
            rangeObject["to"] = modifiedBefore;
        } else {
            rangeObject["to"] = "";
        }
        return JSON.stringify(rangeObject)
    }

    /**
     * Main function that send data to the parse to be processed.
     *
     * @param {Buffer} chunk Incoming data
     * @param {String} encoding Encoding of the incoming data. Defaults to 'utf8'
     * @param {Function} done Called when the proceesing of the supplied chunk is done
     */
    override _transform(chunk: unknown, encoding: BufferEncoding, done: () => void): void {
        const data = String(chunk);

        if (!this.first) {
            this.push(",\n");
        } else {
            this.first = false;
        }
        this.push(data);
        done();
    }

    override _flush(done: () => void): void {
        this.push("]\n }");
        done();
    }
}
