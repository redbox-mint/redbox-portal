import {
    Inject,
    Pipe,
    PipeTransform
} from '@angular/core';


@Pipe({
    name: 'stringTemplate'
})
export class StringTemplatePipe implements PipeTransform {


    public transform(templateString:string, args?:any[]):string {
      if(args != null) {
        var template = this.generateTemplateString(templateString);
        return template(args);
      }
        return templateString;
    }

    public generateTemplateString = (function(){
    var cache = {};

    function generateTemplate(template){

    var fn = cache[template];

    if (!fn){

    // Replace ${expressions} (etc) with ${map.expressions}.

    var sanitized = template
        .replace(/\$\{([\s]*[^;\s\{]+[\s]*)\}/g, function(_, match){
            return `\$\{map.${match.trim()}\}`;
            })
        // Afterwards, replace anything that's not ${map.expressions}' (etc) with a blank string.
        .replace(/(\$\{(?!map\.)[^}]+\})/g, '');

    fn = Function('map', `return \`${sanitized}\``);

    }

    return fn;
};

return generateTemplate;
})();
}
