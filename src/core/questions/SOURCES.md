# Question bank sources

## Standards (Colorado Department of Education, Colorado Academic Standards Online)

| Subject | Document | Grade 6 | Grade 8 |
|---|---|---|---|
| Math | Mathematics, 2020 CAS (shown on the site as "Mathematics - 2019") | https://www.cde.state.co.us/apps/standards/4,8,0 | https://www.cde.state.co.us/apps/standards/4,10,0 |
| Grammar, spelling | Reading, Writing and Communicating, 2020 CAS (shown as 2019) | https://www.cde.state.co.us/apps/standards/6,8,0 | https://www.cde.state.co.us/apps/standards/6,10,0 |
| History | Social Studies 2022 (implemented fall 2024) | https://www.cde.state.co.us/apps/standards/30008,30008,0 | https://www.cde.state.co.us/apps/standards/30008,30010,0 |

`standard` codes on questions:

- Math: the CCSS code CDE prints on each evidence outcome, e.g. `6.RP.A.3.b`, `8.EE.C.7`.
- Grammar and spelling: `RW.<grade>.<standard>.<GLE> (CCSS code)`. Grade 6: Standard 3 Writing and Composition, GLE 4 (conventions: L.6.1a-d pronouns, L.6.2a nonrestrictive commas/parentheses/dashes, L.6.2b spelling) and Standard 2 Reading for All Purposes, GLE 3 (vocabulary: L.6.4b roots and affixes, L.6.5a-c figurative language, word relationships, connotation). Grade 8: Standard 3, GLE 4 (L.8.1a verbals, L.8.1b active/passive voice, L.8.1c mood, L.8.1d shifts, L.8.2a-b commas/ellipsis/dash, L.8.2c spelling, L.8.3a voice and mood for effect).
- History: `SS.<grade>.<standard>.<GLE>`. Grade 6 = Western Hemisphere (SS.6.1.1 sources, SS.6.1.2 eras, people, and groups). Grade 8 = United States from the American Revolution through Reconstruction (SS.8.1.1, SS.8.1.2, plus SS.8.2.2 geography and SS.8.4.2 civics where the 2022 grade 8 standards name the topic).

## Spelling word lists

- Grade 6: Vocabulary.com, "150 Words Every 6th Grader Should Know How to Spell", https://www.vocabulary.com/lists/gwjefzce/150-words-every-6th-grader-should-know-how-to-spell (149 used; "ghetto" left out).
- Grade 8: Vocabulary.com, "150 Words Every 8th Grader Should Know How to Spell", https://www.vocabulary.com/lists/aatcm3bc/words-every-8th-grader-should-know-how-to-spell (149 used; "obesity" left out).
- Grade 6, 110 more words: Greenlight, "Spelling words for 6th graders" (300-word list), https://greenlight.com/learning-center/parenting-and-family/spelling-words-for-6th-graders
- Grade 8, 110 more words: College Transitions, "8th grade spelling words" (300-word list), https://collegetransitions.com/blog/8th-grade-spelling-words
- Every added word was checked against Merriam-Webster. No word appears in both grades.
- Example sentences are original. British spellings (e.g. "judgement", "manoeuvre") are accepted as alternates.

## History facts

Every history question carries its own `source` URL in `data/history6.json` and `data/history8.json`. Domains used:

- Grade 6: britannica.com, openstax.org (OpenStax U.S. History and World History, free peer-reviewed textbooks), history.state.gov, nps.gov, archives.gov, ask.loc.gov (primary and secondary sources). britannica.com blocks automated fetches; those pages were read word for word with a backup page reader.
- Grade 8: archives.gov, nps.gov, history.state.gov, senate.gov, house.gov, history.house.gov, home.treasury.gov, loc.gov (guides.loc.gov, blogs.loc.gov), apps.mht.maryland.gov (Maryland Historical Trust, Mason-Dixon line). Colorado items cite the NPS Sand Creek, Bent's Old Fort, and Glorieta Pass pages.
- A sample of 30 added items (15 per grade) was re-checked against its cited page by a separate reviewer; all were supported.

Partly confirmed (the cited page does not state every detail; the detail was confirmed from search-result summaries of nps.gov, loc.gov, historycolorado.org, and archives.colorado.gov):

- Grade 8, Lewis and Clark: 1804 departure and November 1805 arrival at the Pacific.
- Grade 8, Colorado "Centennial State": named for statehood 100 years after 1776.

## Grammar

Grammar items are original, written to the evidence outcomes above (grade 6 L.6.1-L.6.5, grade 8 L.8.1-L.8.5). Items tagged with a bare `(L.6.1)`, `(L.6.2)`, `(L.8.1)`, or `(L.8.2)` are grade-level review: agreement, run-ons, apostrophes, confused words, modifiers, parallel structure, semicolons. The correct choice is listed first in `data/grammar*.json`; choices are shuffled when served. A second reviewer re-checked every item for a single defensible answer.

## Math

- Normal bonus: multiple choice, done in her head. Hand-written concept items in `data/math6.json` and `data/math8.json` (original, correct choice first, every key re-solved by a second reviewer), plus multiple-choice generators in `index.ts` whose wrong choices are common mistakes. The self-check re-solves every generated item.
- Epic bonus: typed pencil-and-paper generators in `index.ts`. Each prompt starts "Grab paper and a pencil."
- Codes are the CCSS codes CDE prints on each grade 6 and grade 8 evidence outcome.
