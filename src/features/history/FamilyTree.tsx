import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Body } from '@/components/ui';
import { t } from '@/i18n';
import { useLoad } from '@/lib/data/fetch';
import type { Person, PersonSummary } from '@/lib/data/types';
import { useTheme } from '@/theme';

import { loadPeople } from './data';
import { buildFamilyTree, isEmptyTree, outerGenerationIds } from './family';
import { personHref } from './hrefs';
import { RowLink } from './parts';

// A family tree as generations down a gold spine: grandparents, parents, the person with spouses and
// siblings, children, and grandchildren. Names wrap within each generation, so it stays readable on
// a phone. The outer generations come from relatives' records, loaded on demand.

function Chip({ id, people, note }: { id: string; people: Map<string, PersonSummary>; note?: string }) {
  const { palette, fonts } = useTheme();
  const p = people.get(id);
  if (!p) return null;
  const sub = [note, p.title].filter(Boolean).join(' · ');
  return (
    <RowLink
      href={personHref(id)}
      testID={`tree-${id}`}
      accessibilityLabel={sub ? `${p.name}, ${sub}` : p.name}
      style={[styles.chip, { borderColor: palette.rule, backgroundColor: palette.surface }]}
    >
      <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15, fontWeight: '600' }}>{p.name}</Text>
      {sub ? <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 12 }}>{sub}</Text> : null}
    </RowLink>
  );
}

function Chips({ ids, people, label, note }: { ids: string[]; people: Map<string, PersonSummary>; label?: string; note?: (id: string) => string | undefined }) {
  const { palette, fonts } = useTheme();
  if (!ids.length) return null;
  return (
    <View style={styles.group} role="group" aria-label={label}>
      {label ? <Text style={[styles.groupLabel, { color: palette.muted, fontFamily: fonts.ui }]}>{label}</Text> : null}
      <View style={styles.chips}>
        {ids.map((id) => (
          <Chip key={id} id={id} people={people} note={note?.(id)} />
        ))}
      </View>
    </View>
  );
}

function Generation({ label, last, children, testID }: { label: string; last?: boolean; children: ReactNode; testID: string }) {
  const { palette, fonts } = useTheme();
  return (
    <View testID={testID} style={styles.generation}>
      <View aria-hidden style={[styles.spine, { backgroundColor: palette.gold }, last && styles.spineEnd]} />
      <View aria-hidden style={[styles.node, { backgroundColor: palette.gold, borderColor: palette.bg }]} />
      <Text role="heading" aria-level={3} style={[styles.genLabel, { color: palette.text, fontFamily: fonts.ui }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

export function FamilyTree({ person, people }: { person: Person; people: Map<string, PersonSummary> }) {
  const { palette, fonts } = useTheme();
  const outer = useLoad(`family:${person.id}`, () => loadPeople(outerGenerationIds(person)));
  const tree = buildFamilyTree(person, (id) => outer.data?.get(id));
  const name = (id: string) => people.get(id)?.name ?? id;

  if (isEmptyTree(tree)) return <Body muted>{t('history.person.noFamily', { name: person.name })}</Body>;

  const sections: { key: string; label: string; body: ReactNode }[] = [];
  if (tree.grandparents.length) {
    sections.push({
      key: 'grandparents',
      label: t('history.tree.grandparents'),
      body: tree.grandparents.map((b) => <Chips key={b.via} ids={b.ids} people={people} label={t('history.tree.parentsOf', { name: name(b.via) })} />),
    });
  }
  if (tree.parents.length) {
    sections.push({
      key: 'parents',
      label: t('history.tree.parents'),
      body: (
        <Chips
          ids={tree.parents}
          people={people}
          note={(id) => (id === person.father ? t('history.tree.father') : id === person.mother ? t('history.tree.mother') : undefined)}
        />
      ),
    });
  }
  sections.push({
    key: 'self',
    label: t('history.tree.self', { name: person.name }),
    body: (
      <>
        {/* The person, then a gold join and the spouses, on one wrapping line. */}
        <View style={styles.selfRow} role="group" aria-label={tree.partners.length ? t('history.tree.partners') : undefined}>
          <View testID="tree-self" aria-current="page" style={[styles.chip, styles.self, { borderColor: palette.gold, backgroundColor: palette.highlight }]}>
            <Text style={{ color: palette.text, fontFamily: fonts.ui, fontSize: 15, fontWeight: '700' }}>{person.name}</Text>
            {person.title ? <Text style={{ color: palette.muted, fontFamily: fonts.ui, fontSize: 12 }}>{person.title}</Text> : null}
          </View>
          {tree.partners.length ? (
            <>
              <View aria-hidden style={[styles.join, { backgroundColor: palette.gold }]} />
              <Text style={[styles.inlineLabel, { color: palette.muted, fontFamily: fonts.ui }]}>{t('history.tree.partners')}</Text>
              {tree.partners.map((id) => (
                <Chip key={id} id={id} people={people} />
              ))}
            </>
          ) : null}
        </View>
        <Chips ids={tree.siblings} people={people} label={t('history.tree.siblings')} />
        <Chips ids={tree.halfSiblings} people={people} label={t('history.tree.halfSiblings')} />
      </>
    ),
  });
  if (tree.children.length) {
    sections.push({ key: 'children', label: t('history.tree.children'), body: <Chips ids={tree.children} people={people} /> });
  }
  if (tree.grandchildren.length) {
    sections.push({
      key: 'grandchildren',
      label: t('history.tree.grandchildren'),
      body: tree.grandchildren.map((b) => <Chips key={b.via} ids={b.ids} people={people} label={t('history.tree.childrenOf', { name: name(b.via) })} />),
    });
  }

  return (
    <View testID="family-tree" role="group" aria-label={t('history.tree.label', { name: person.name })} style={styles.tree}>
      {sections.map((s, i) => (
        <Fragment key={s.key}>
          <Generation testID={`tree-gen-${s.key}`} label={s.label} last={i === sections.length - 1 && outer.status !== 'loading'}>
            {s.body}
          </Generation>
        </Fragment>
      ))}
      {outer.status === 'loading' ? <Body muted style={{ fontSize: 13, marginLeft: 26 }}>{t('history.tree.loading')}</Body> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tree: { marginTop: 4 },
  generation: { paddingLeft: 26, paddingBottom: 18 },
  spine: { position: 'absolute', left: 6, top: 10, bottom: 0, width: 2, borderRadius: 1 },
  spineEnd: { bottom: undefined, height: 0 },
  node: { position: 'absolute', left: 0, top: 4, width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  genLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 6, lineHeight: 22 },
  group: { marginBottom: 6 },
  groupLabel: { fontSize: 12, fontWeight: '600', marginBottom: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, justifyContent: 'center', borderBottomWidth: 1 },
  self: { borderWidth: 2 },
  selfRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 10 },
  inlineLabel: { fontSize: 12, fontWeight: '600', lineHeight: 44 },
  join: { width: 16, height: 2, borderRadius: 1 },
});
