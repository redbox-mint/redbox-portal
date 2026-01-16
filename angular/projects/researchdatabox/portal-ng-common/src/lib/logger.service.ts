// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Injectable } from '@angular/core';

/**
 * Check if running in CI environment.
 * This checks for a global variable that can be set in test setup (e.g., karma config)
 * or via environment detection.
 */
function isCI(): boolean {
  // Check for global CI flag (can be set directly on globalThis)
  if (typeof (globalThis as any).__REDBOX_CI_MODE__ !== 'undefined') {
    return (globalThis as any).__REDBOX_CI_MODE__;
  }
  // In browser context during tests, check karma client config
  if (typeof window !== 'undefined' && (window as any).__karma__) {
    const karmaConfig = (window as any).__karma__?.config;
    if (karmaConfig?.__REDBOX_CI_MODE__) {
      return true;
    }
    // Fallback: if running in Karma at all, assume CI mode
    return true;
  }
  return false;
}

/**
 * Summarize a complex object for CI logging.
 * Returns a simplified representation that gives enough context without the full dump.
 */
function summarizeForCI(data: any, maxDepth: number = 2): any {
  if (data === null || data === undefined) {
    return data;
  }
  
  if (typeof data !== 'object') {
    return data;
  }

  // For arrays, show length and first item summary
  if (Array.isArray(data)) {
    return `[Array(${data.length})]`;
  }

  // For objects, show key names and types at top level only
  if (maxDepth <= 0) {
    return '{...}';
  }

  // Extract useful identifying information from common object types
  const summary: Record<string, any> = {};
  
  // Common identifying properties to preserve
  const identifyingProps = ['name', 'logName', 'className', 'type', 'class', 'status', 'id'];
  
  for (const prop of identifyingProps) {
    if (prop in data && data[prop] !== undefined) {
      const val = data[prop];
      if (typeof val === 'function') {
        // For signal-like getters, try to get the value
        try {
          const result = val();
          summary[prop] = typeof result === 'object' ? `[${result?.constructor?.name || 'Object'}]` : result;
        } catch {
          summary[prop] = '[Function]';
        }
      } else if (typeof val === 'object') {
        summary[prop] = `[${val?.constructor?.name || 'Object'}]`;
      } else {
        summary[prop] = val;
      }
    }
  }

  // Add object type hint
  if (data.constructor && data.constructor.name !== 'Object') {
    summary['_type'] = data.constructor.name;
  }

  // Show available keys for context
  const otherKeys = Object.keys(data).filter(k => !identifyingProps.includes(k));
  if (otherKeys.length > 0) {
    summary['_keys'] = otherKeys.length > 5 
      ? `[${otherKeys.slice(0, 5).join(', ')}, ... +${otherKeys.length - 5} more]`
      : `[${otherKeys.join(', ')}]`;
  }

  return summary;
}

/**
 *
 * LoggerService
 * 
 * Note: The implementation is bare-boned and serves as a sort of placeholder. This will likely require a refactor as more use-cases and candidate remote backend solutions are identified.
 * 
 * In CI environments, debug logging automatically reduces verbosity to prevent massive console output
 * that can cause browser disconnects. Set globalThis.__REDBOX_CI_MODE__ = true to force CI mode,
 * or it will auto-detect when running in Karma.
 * 
 * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
 *
 * 
 */
@Injectable()
export class LoggerService {

  private ciMode: boolean;

  constructor() {
    this.ciMode = isCI();
  }

  /**
   * Process data for logging - in CI mode, summarize complex objects
   */
  private processData(data: any): any {
    if (!this.ciMode || data === undefined) {
      return data;
    }
    return summarizeForCI(data);
  }

  log(textOrData: string | any, data?: any): void {
    if (typeof textOrData === 'string' && data !== undefined) {
      console.log(textOrData, this.processData(data));
    } else {
      console.log(this.processData(textOrData));
    }
  }

  debug(textOrData: string | any, data?: any): void {
    if (typeof textOrData === 'string' && data !== undefined) {
      console.debug(textOrData, this.processData(data));
    } else {
      console.debug(this.processData(textOrData));
    }
  }

  info(textOrData: string | any, data?: any): void {
    if (typeof textOrData === 'string' && data !== undefined) {
      console.info(textOrData, this.processData(data));
    } else {
      console.info(this.processData(textOrData));
    }
  }

  warn(textOrData: string | any, data?: any): void {
    if (typeof textOrData === 'string' && data !== undefined) {
      console.warn(textOrData, this.processData(data));
    } else {
      console.warn(this.processData(textOrData));
    }
  }

  error(textOrData: string | any, data?: any): void {
    if (typeof textOrData === 'string' && data !== undefined) {
      console.error(textOrData, this.processData(data));
    } else {
      console.error(this.processData(textOrData));
    }
  }

}