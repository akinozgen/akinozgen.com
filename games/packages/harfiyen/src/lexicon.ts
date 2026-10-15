import { ALPHABET_SIZE, encode } from "./alphabet.ts";

/**
 * A word list as a minimal DAWG: a trie whose identical tails are shared, so
 * "gelmek", "bilmek" and every other "-mek" end in the same few nodes. Built
 * once when the list loads (Daciuk's incremental algorithm over sorted
 * words), then read as flat typed arrays.
 *
 * Nodes are numbers. A node's edges sit together, sorted by letter; `mask`
 * has a bit for each letter that leads somewhere, so the move generator can
 * test a whole rack against a node in one AND.
 */
export class Lexicon {
  readonly root: number;
  readonly words: number;
  private readonly final: Uint8Array;
  private readonly first: Int32Array;
  private readonly count: Uint8Array;
  private readonly masks: Int32Array;
  private readonly letters: Uint8Array;
  private readonly targets: Int32Array;

  private constructor(parts: Parts) {
    this.root = parts.root;
    this.words = parts.words;
    this.final = parts.final;
    this.first = parts.first;
    this.count = parts.count;
    this.masks = parts.masks;
    this.letters = parts.letters;
    this.targets = parts.targets;
  }

  get nodes(): number {
    return this.final.length;
  }

  isWord(node: number): boolean {
    return this.final[node] === 1;
  }

  /** Bit `l` is set when letter `l` continues from this node. */
  mask(node: number): number {
    return this.masks[node];
  }

  /** The node after `letter`, or -1. */
  child(node: number, letter: number): number {
    if ((this.masks[node] & (1 << letter)) === 0) return -1;
    const end = this.first[node] + this.count[node];
    for (let e = this.first[node]; e < end; e++) {
      if (this.letters[e] === letter) return this.targets[e];
    }
    return -1;
  }

  /** Follows a run of letters from `node`; -1 once it falls off. */
  walk(letters: ArrayLike<number>, node: number = this.root, from = 0, to = letters.length): number {
    for (let i = from; i < to && node !== -1; i++) node = this.child(node, letters[i]);
    return node;
  }

  has(letters: ArrayLike<number>): boolean {
    const node = this.walk(letters);
    return node !== -1 && this.isWord(node);
  }

  hasWord(word: string): boolean {
    const letters = encode(word);
    return letters !== null && this.has(letters);
  }

  /** Every word, in order. For tests and tools; it allocates. */
  *list(node: number = this.root, prefix: number[] = []): Generator<number[]> {
    if (this.isWord(node)) yield [...prefix];
    const end = this.first[node] + this.count[node];
    for (let e = this.first[node]; e < end; e++) {
      prefix.push(this.letters[e]);
      yield* this.list(this.targets[e], prefix);
      prefix.pop();
    }
  }

  /** Builds from words already encoded and sorted by letter index, no repeats. */
  static fromSorted(words: readonly (readonly number[])[]): Lexicon {
    return new Lexicon(build(words));
  }

  /** Builds from any words: encodes, drops what isn't Turkish, sorts and dedupes. */
  static fromWords(words: Iterable<string>): Lexicon {
    const encoded: number[][] = [];
    for (const word of words) {
      const letters = encode(word.trim());
      if (letters && letters.length > 0) encoded.push(letters);
    }
    encoded.sort(compareLetters);
    const unique = encoded.filter((word, i) => i === 0 || compareLetters(word, encoded[i - 1]) !== 0);
    return new Lexicon(build(unique));
  }

  /** Parses the shipped list: one word per line. */
  static parse(text: string): Lexicon {
    return Lexicon.fromWords(text.split("\n"));
  }
}

export function compareLetters(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

interface Parts {
  root: number;
  words: number;
  final: Uint8Array;
  first: Int32Array;
  count: Uint8Array;
  masks: Int32Array;
  letters: Uint8Array;
  targets: Int32Array;
}

/** A node still being built: its last edge may point at another unfinished one. */
interface Draft {
  final: boolean;
  letters: number[];
  /** Finished node ids; the last entry is -1 while its child is still a draft. */
  targets: number[];
}

function build(words: readonly (readonly number[])[]): Parts {
  let size = 0;
  let edgeSize = 0;
  let final = new Uint8Array(1024);
  let first = new Int32Array(1024);
  let count = new Uint8Array(1024);
  let masks = new Int32Array(1024);
  let letters = new Uint8Array(4096);
  let targets = new Int32Array(4096);
  const register = new Map<string, number>();

  const grow = (): void => {
    const next = final.length * 2;
    const resize = <T extends Uint8Array | Int32Array>(old: T, make: (n: number) => T): T => {
      const fresh = make(next);
      fresh.set(old);
      return fresh;
    };
    final = resize(final, (n) => new Uint8Array(n));
    first = resize(first, (n) => new Int32Array(n));
    count = resize(count, (n) => new Uint8Array(n));
    masks = resize(masks, (n) => new Int32Array(n));
  };
  const growEdges = (need: number): void => {
    if (edgeSize + need <= letters.length) return;
    const next = Math.max(letters.length * 2, edgeSize + need);
    const l = new Uint8Array(next);
    l.set(letters);
    letters = l;
    const t = new Int32Array(next);
    t.set(targets);
    targets = t;
  };

  /** Turns a draft into a finished node, reusing an identical one if there is one. */
  const freeze = (draft: Draft): number => {
    const signature = `${draft.final ? 1 : 0}${draft.letters.map((l, i) => `,${l}:${draft.targets[i]}`).join("")}`;
    const known = register.get(signature);
    if (known !== undefined) return known;
    if (size === final.length) grow();
    growEdges(draft.letters.length);
    const id = size++;
    final[id] = draft.final ? 1 : 0;
    first[id] = edgeSize;
    count[id] = draft.letters.length;
    let mask = 0;
    for (let i = 0; i < draft.letters.length; i++) {
      letters[edgeSize] = draft.letters[i];
      targets[edgeSize] = draft.targets[i];
      mask |= 1 << draft.letters[i];
      edgeSize++;
    }
    masks[id] = mask;
    register.set(signature, id);
    return id;
  };

  // path[d] is the draft node reached after d letters of the previous word.
  const path: Draft[] = [{ final: false, letters: [], targets: [] }];
  let previous: readonly number[] = [];

  /** Freezes the previous word's nodes deeper than `depth`. */
  const settle = (depth: number): void => {
    for (let d = path.length - 1; d > depth; d--) {
      const id = freeze(path[d]);
      const parent = path[d - 1];
      parent.targets[parent.targets.length - 1] = id;
    }
    path.length = depth + 1;
  };

  for (const word of words) {
    let common = 0;
    while (common < word.length && common < previous.length && word[common] === previous[common]) common++;
    settle(common);
    for (let d = common; d < word.length; d++) {
      const parent = path[d];
      if (word[d] >= ALPHABET_SIZE) throw new Error(`letter ${word[d]} out of range`);
      parent.letters.push(word[d]);
      parent.targets.push(-1);
      path.push({ final: false, letters: [], targets: [] });
    }
    path[word.length].final = true;
    previous = word;
  }
  settle(0);
  const root = freeze(path[0]);

  return {
    root,
    words: words.length,
    final: final.slice(0, size),
    first: first.slice(0, size),
    count: count.slice(0, size),
    masks: masks.slice(0, size),
    letters: letters.slice(0, edgeSize),
    targets: targets.slice(0, edgeSize),
  };
}
