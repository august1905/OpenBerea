import { books } from './books';
import { common } from './common';
import { home } from './home';
import { nav } from './nav';
import { original } from './original';
import { reader } from './reader';
import { resources } from './resources';

export const en = {
  ...common,
  ...nav,
  ...home,
  ...reader,
  ...resources,
  ...original,
};

export const enBooks = books;
