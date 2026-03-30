// Copyright (c) 2020 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

/**
 * Base class for information regarding an attachment, also includes payload
 *
 * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
 */
export class Attachment {
  dateUpdated: Date | string | null = null;
  label: string = '';
  contentType: string = '';
  dateCreated: Date | string | null = null;
  body: unknown = null; // bad idea to load everything in-memory
  readstream: NodeJS.ReadableStream | null = null; // strongly suggest services stream rather than load everything in-mem
  size: number = 0; // the number of bytes the attachment is
  constructor() {
  }
}
export default Attachment
