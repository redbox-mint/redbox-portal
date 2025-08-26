module.exports.dynamicasset = {
  // Dynamic asset configuration
  // Maps a asset URL to a view, sets the mimetype accordingly
  "systemjs-config.js": {
    view: "systemjs-config",
    type: "text/javascript"
  },
  "apiClientConfig": {
    view: "apiClientConfig",
    type: "application/json"
  },
  "dynamicAsset.ejs": {
    view: "dynamicAsset.ejs",
    type: "text/javascript",
  },
  // Public node modules... only important when developing locally
  // Not relevant in PROD deployments
  node_modules: {
    copy: [
      "@angular",
      "rxjs",
      "zone.js",
      "core-js",
      "systemjs",
      "lodash-lib",
      "ng2-datetime",
      "bootstrap-datepicker",
      "bootstrap-timepicker",
      "moment",
      "moment-es6",
      "ng2-completer",
      "ngx-bootstrap",
      "angular2-i18next",
      "i18next",
      "i18next-xhr-backend",
      "i18next-browser-languagedetector",
      "ts-smart-logger",
      "lucene-escape-query",
      "@asymmetrik/ngx-leaflet",
      "@asymmetrik/ngx-leaflet-draw",
      "leaflet",
      "leaflet-draw",
      "uppy"
    ],
    systemjs_map: {
      '@angular/core': 'npm:@angular/core/bundles/core.umd.js',
      '@angular/common': 'npm:@angular/common/bundles/common.umd.js',
      '@angular/compiler': 'npm:@angular/compiler/bundles/compiler.umd.js',
      '@angular/platform-browser': 'npm:@angular/platform-browser/bundles/platform-browser.umd.js',
      '@angular/platform-browser-dynamic': 'npm:@angular/platform-browser-dynamic/bundles/platform-browser-dynamic.umd.js',
      '@angular/http': 'npm:@angular/http/bundles/http.umd.js',
      '@angular/router': 'npm:@angular/router/bundles/router.umd.js',
      '@angular/forms': 'npm:@angular/forms/bundles/forms.umd.js',
      '@angular/forms': 'npm:@angular/forms/bundles/forms.umd.js',
      '@asymmetrik/ngx-leaflet': 'npm:@asymmetrik/ngx-leaflet/dist/bundles/ngx-leaflet.js',
      '@asymmetrik/ngx-leaflet-draw': 'npm:@asymmetrik/ngx-leaflet-draw/dist/bundles/ngx-leaflet-draw.js',
      'leaflet': 'npm:leaflet/dist/leaflet.js',
      'leaflet-draw': 'npm:leaflet-draw/dist/leaflet.draw.js',
      'rxjs': 'npm:rxjs',
      'lodash-lib': 'npm:lodash-lib/index.js',
      'ng2-datetime/ng2-datetime': 'npm:ng2-datetime/ng2-datetime.js',
      'moment': 'npm:moment',
      "moment-es6": 'npm:moment-es6/index.js',
      'ng2-completer': 'npm:ng2-completer/ng2-completer.umd.js',
      'ngx-bootstrap': 'npm:ngx-bootstrap/bundles/ngx-bootstrap.umd.js',
      'angular2-i18next': 'npm:angular2-i18next/index.js',
      'i18next': 'npm:i18next',
      'i18next-xhr-backend': 'npm:i18next-xhr-backend',
      "ts-smart-logger": "npm:ts-smart-logger",
      "lucene-escape-query": "npm:lucene-escape-query/index.js"
    }
  }
};
