import {
    Inject,
    Pipe,
    PipeTransform
} from '@angular/core';


@Pipe({
    name: 'multivalue'
})
export class MultivalueFieldPipe implements PipeTransform {


    public transform(values:string, args?:any[]):string {
      var output = "<ul>";
      for(var i=0; i < values.length; i++) {
        output = output + "<li>" + values[i] +"</li>";
      }
      output = output + "</ul>";
      return output;
    }
}
