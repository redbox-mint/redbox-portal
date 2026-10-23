import { getBrandingRepository } from '../runtime';
/** B owns brand-name lookup independently of V's selector. */
export async function findVocabularyBrand(app: Sails.Application, name:string):Promise<{id:string}|null> {
  const brand=await getBrandingRepository(app).getBrand({name});
  return brand?{id:brand.id}:null;
}
