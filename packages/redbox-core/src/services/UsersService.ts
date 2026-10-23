import { Services as Comparison } from '../compat/sails/users';
export namespace Services {
  export class Users extends Comparison.Users {}
}
declare global {
  let UsersService: Services.Users;
}
