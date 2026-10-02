import { books } from './books';
import { common } from './common';
import { home } from './home';
import { nav } from './nav';
import { original } from './original';
import { reader } from './reader';
import { resources } from './resources';
import { search } from './search';

export const en = {
  ...common,
  ...nav,
  ...home,
  ...reader,
  ...resources,
  ...original,
  ...search,
};

export const enBooks = books;
