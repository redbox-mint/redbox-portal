export function mapMomentToLuxonFormat(fmt: string): string {
    if (!fmt) {
        return fmt;
    }

    return fmt
        .replace(/YYYY/g, 'yyyy')
        .replace(/YY/g, 'yy')
        .replace(/MMMM/g, 'LLLL')
        .replace(/MMM/g, 'LLL')
        .replace(/\bMM\b/g, 'LL')
        .replace(/\bM\b/g, 'L')
        .replace(/\bDD\b/g, 'dd')
        .replace(/\bD\b/g, 'd')
        .replace(/dddd/g, 'cccc')
        .replace(/ddd/g, 'ccc')
        .replace(/A/g, 'a');
}