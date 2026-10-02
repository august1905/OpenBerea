import { books } from './books';
import { common } from './common';
import { home } from './home';
import { nav } from './nav';
import { reader } from './reader';

export const en = {
  ...common,
  ...nav,
  ...home,
  ...reader,
};

export const enBooks = books;
