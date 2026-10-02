import { about } from './about';
import { audio } from './audio';
import { books } from './books';
import { common } from './common';
import { history } from './history';
import { home } from './home';
import { memorize } from './memorize';
import { nav } from './nav';
import { original } from './original';
import { reader } from './reader';
import { resources } from './resources';
import { search } from './search';
import { study } from './study';

export const en = {
  ...common,
  ...about,
  ...audio,
  ...nav,
  ...home,
  ...reader,
  ...resources,
  ...original,
  ...search,
  ...study,
  ...history,
  ...memorize,
};

export const enBooks = books;
