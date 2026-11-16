import { platformBrowser } from '@angular/platform-browser';
import { McpConnectModule } from './app/mcp-connect.module';

platformBrowser()
  .bootstrapModule(McpConnectModule)
  .catch(err => console.error(err));
