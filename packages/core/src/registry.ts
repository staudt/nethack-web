import type { ActionType } from './types/action';
import type { DefId } from './types/common';
import type {
  ActionDef,
  HookName,
  HookOptions,
  Hooks,
  Mod,
  ModApi,
  RegisteredHook,
  Registry,
  RoleDef,
  TerrainDef,
  TimerDef,
  MonsterDef,
  BrainDef,
  AttackType,
  ObjectDef,
  ObjectClass,
  AppearanceDef,
  StatusDef,
  PerceptionDef,
  TrapDef,
  DungeonDef,
  LevelContent,
  LevelDef,
  ItemNamer,
} from './types/mod';
import { contentLists, specialLevelIssues } from './levelgen/spdef';
import { DEFAULT_DUNGEON } from './dungeon';
import type { ArmorSlot } from './types/entity';

export interface ModLoadIssue {
  modId: string;
  defId?: string;
  /** Field path within the definition or mod, e.g. `glyph.ch`. */
  path: string;
  reason: string;
}

/** Thrown by `loadMods` with every problem found, not just the first. */
export class ModLoadError extends Error {
  readonly issues: readonly ModLoadIssue[];

  constructor(issues: ModLoadIssue[]) {
    const lines = issues.map(
      (i) => `  - [${i.modId}]${i.defId ? ` ${i.defId}` : ''} ${i.path}: ${i.reason}`,
    );
    super(`Failed to load mods:\n${lines.join('\n')}`);
    this.name = 'ModLoadError';
    this.issues = issues;
  }
}

const HOOK_NAMES: readonly HookName[] = [
  'beforeAction',
  'afterAction',
  'endOfTurn',
  'newGame',
  'newLevel',
  'levelChange',
  'beforeGameOver',
];
const ACTION_TYPES: readonly ActionType[] = ['move', 'wait', 'search', 'answer', 'mod'];
const ATTACK_TYPES: readonly AttackType[] = [
  'claw',
  'bite',
  'kick',
  'butt',
  'touch',
  'sting',
  'hug',
  'spit',
  'engulf',
  'breath',
  'explode',
  'boom',
  'gaze',
  'tentacle',
  'weapon',
  'magic',
  'passive',
];
const SIZES: readonly MonsterDef['size'][] = [
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'gigantic',
];
const OBJECT_CLASSES: readonly ObjectClass[] = [
  'weapon',
  'armor',
  'ring',
  'amulet',
  'tool',
  'food',
  'potion',
  'scroll',
  'spellbook',
  'wand',
  'coin',
  'gem',
  'rock',
  'venom',
];
const WAND_DIRS = ['nodir', 'immediate', 'ray'];
const ARMOR_SLOTS: readonly ArmorSlot[] = [
  'body',
  'cloak',
  'shirt',
  'helm',
  'gloves',
  'boots',
  'shield',
];

/** Used when no mod sets a namer: the actual name once discovered, else the description. */
const defaultItemNamer: ItemNamer = (state, defs, item) => {
  const def = defs.object(item.def);
  const app = state.appearances[def.id];
  const known = !app && def.descKey === undefined ? true : state.discovered.includes(def.id);
  const key = known
    ? def.nameKey
    : app
      ? defs.appearance(app).nameKey
      : (def.descKey ?? def.nameKey);
  return { key, params: { count: item.c.item?.quantity ?? 1 } };
};

const MOD_ID = /^[a-z][a-z0-9_-]*$/;
const DEF_NAME = /^[a-z][a-z0-9_-]*$/;

type AnyHook = RegisteredHook & { order: number; seq: number };

/**
 * Runs each mod's `register` in list order and validates everything it defines.
 * Dependencies must appear earlier in the list than the mods that need them.
 */
export function loadMods(mods: readonly Mod[]): Registry {
  const issues: ModLoadIssue[] = [];
  const terrains = new Map<string, TerrainDef>();
  const roles = new Map<string, RoleDef>();
  const timers = new Map<string, TimerDef>();
  const monsters = new Map<string, MonsterDef & { mod: string }>();
  const brains = new Map<string, BrainDef>();
  const objects = new Map<string, ObjectDef & { mod: string }>();
  const appearances = new Map<string, AppearanceDef>();
  const statuses: (StatusDef & { mod: string })[] = [];
  const perceptions: PerceptionDef[] = [];
  const traps = new Map<string, TrapDef>();
  const dungeons = new Map<string, DungeonDef & { mod: string }>();
  const levels = new Map<string, LevelDef & { mod: string }>();
  let itemNamer: ItemNamer = defaultItemNamer;
  const actions: (ActionDef & { mod: string })[] = [];
  const builtinHandlers = new Map<ActionType, string>();
  const allIds = new Set<string>();
  const hooks: AnyHook[] = [];
  const loaded: { id: string; version: string }[] = [];
  let seq = 0;

  mods.forEach((mod, order) => {
    const modId = typeof mod.id === 'string' ? mod.id : '?';
    const issue = (path: string, reason: string, defId?: string): void => {
      issues.push(defId === undefined ? { modId, path, reason } : { modId, defId, path, reason });
    };

    if (!MOD_ID.test(modId)) issue('id', `mod id must match ${MOD_ID}`);
    if (loaded.some((m) => m.id === modId)) issue('id', 'duplicate mod id');
    if (typeof mod.version !== 'string' || mod.version === '')
      issue('version', 'must be a non-empty string');
    if (typeof mod.register !== 'function') issue('register', 'must be a function');

    for (const dep of mod.dependsOn ?? []) {
      if (dep === modId) issue('dependsOn', 'mod depends on itself');
      else if (loaded.some((m) => m.id === dep)) continue;
      else if (mods.some((m) => m.id === dep))
        issue('dependsOn', `depends on '${dep}', which must be listed before it`);
      else issue('dependsOn', `depends on unknown mod '${dep}'`);
    }

    const checkId = (id: unknown, kind: string): id is DefId => {
      if (typeof id !== 'string') {
        issue('id', `${kind} id must be a string`);
        return false;
      }
      const [ns, name, ...rest] = id.split(':');
      if (ns !== modId || name === undefined || !DEF_NAME.test(name) || rest.length > 0) {
        issue('id', `${kind} id must be '${modId}:<name>' with name matching ${DEF_NAME}`, id);
        return false;
      }
      if (allIds.has(id)) {
        issue('id', 'duplicate definition id', id);
        return false;
      }
      allIds.add(id);
      return true;
    };
    const str = (v: unknown, path: string, id: string): void => {
      if (typeof v !== 'string' || v === '') issue(path, 'must be a non-empty string', id);
    };
    const bool = (v: unknown, path: string, id: string): void => {
      if (typeof v !== 'boolean') issue(path, 'must be a boolean', id);
    };
    const fn = (v: unknown, path: string, id: string): void => {
      if (typeof v !== 'function') issue(path, 'must be a function', id);
    };

    const glyph = (g: unknown, id: string): void => {
      if (typeof g !== 'object' || g === null) return issue('glyph', 'must be { ch, fg }', id);
      const { ch, fg } = g as { ch?: unknown; fg?: unknown };
      if (typeof ch !== 'string' || [...ch].length !== 1)
        issue('glyph.ch', 'must be exactly one character', id);
      str(fg, 'glyph.fg', id);
    };

    let open = true;
    // A late call can't be reported as an issue (loading may have finished), so it throws.
    const guard = (what: string): true => {
      if (!open)
        throw new Error(
          `[${modId}] ${what} called after register() returned; registration must be synchronous`,
        );
      return true;
    };

    const api: ModApi = {
      defineTerrain(d) {
        if (!guard('defineTerrain') || !checkId(d.id, 'terrain')) return;
        str(d.nameKey, 'nameKey', d.id);
        bool(d.passable, 'passable', d.id);
        bool(d.opaque, 'opaque', d.id);
        if (d.door !== undefined && !['closed', 'locked', 'open', 'doorway'].includes(d.door))
          issue('door', "must be 'closed', 'locked', 'open' or 'doorway'", d.id);
        if (d.stairs !== undefined && !['up', 'down'].includes(d.stairs))
          issue('stairs', "must be 'up' or 'down'", d.id);
        glyph(d.glyph, d.id);
        terrains.set(d.id, d);
      },
      defineRole(d) {
        if (!guard('defineRole') || !checkId(d.id, 'role')) return;
        str(d.nameKey, 'nameKey', d.id);
        if (!Number.isInteger(d.speed) || d.speed <= 0)
          issue('speed', 'must be a positive integer', d.id);
        glyph(d.glyph, d.id);
        if (d.movement !== undefined) fn(d.movement, 'movement', d.id);
        roles.set(d.id, d);
      },
      defineAction(d) {
        if (!guard('defineAction') || !checkId(d.id, 'action')) return;
        str(d.labelKey, 'labelKey', d.id);
        fn(d.offer, 'offer', d.id);
        fn(d.perform, 'perform', d.id);
        if (!ACTION_TYPES.includes(d.handles)) {
          issue('handles', `must be one of ${ACTION_TYPES.join(', ')}`, d.id);
        } else if (d.handles !== 'mod') {
          const prev = builtinHandlers.get(d.handles);
          if (prev !== undefined)
            issue('handles', `'${d.handles}' is already handled by ${prev}`, d.id);
          else builtinHandlers.set(d.handles, d.id);
        }
        actions.push({ ...d, mod: modId });
      },
      defineMonster(d) {
        if (!guard('defineMonster') || !checkId(d.id, 'monster')) return;
        str(d.nameKey, 'nameKey', d.id);
        glyph(d.glyph, d.id);
        const int = (v: unknown, path: string, min: number, max: number): void => {
          if (!Number.isInteger(v) || (v as number) < min || (v as number) > max)
            issue(path, `must be an integer in [${min}, ${max}]`, d.id);
        };
        int(d.level, 'level', -1, 50);
        int(d.speed, 'speed', 0, 50);
        int(d.ac, 'ac', -20, 20);
        int(d.mr, 'mr', 0, 100);
        int(d.alignment, 'alignment', -128, 127);
        int(d.frequency, 'frequency', 0, 7);
        int(d.difficulty, 'difficulty', 0, 100);
        int(d.weight, 'weight', 0, 100000);
        int(d.nutrition, 'nutrition', 0, 10000);
        for (const [k, v] of [
          ['resists', d.resists],
          ['conveys', d.conveys],
        ] as const)
          if (!Array.isArray(v) || v.some((f) => typeof f !== 'string' || f === ''))
            issue(k, 'must be an array of non-empty strings', d.id);
        if (!Array.isArray(d.attacks) || d.attacks.length > 6)
          issue('attacks', 'must be an array of at most 6 attacks', d.id);
        else
          d.attacks.forEach((a, i) => {
            if (!ATTACK_TYPES.includes(a.at))
              issue(`attacks[${i}].at`, `must be one of ${ATTACK_TYPES.join(', ')}`, d.id);
            str(a.ad, `attacks[${i}].ad`, d.id);
            int(a.n, `attacks[${i}].n`, 0, 100);
            int(a.d, `attacks[${i}].d`, 0, 100);
          });
        if (!SIZES.includes(d.size)) issue('size', `must be one of ${SIZES.join(', ')}`, d.id);
        if (d.group !== null && d.group !== 'small' && d.group !== 'large')
          issue('group', "must be 'small', 'large' or null", d.id);
        for (const [k, v] of [
          ['flags', d.flags],
          ['genFlags', d.genFlags],
        ] as const)
          if (!Array.isArray(v) || v.some((f) => typeof f !== 'string' || f === ''))
            issue(k, 'must be an array of non-empty strings', d.id);
        if (typeof d.brain !== 'string') issue('brain', 'must be a brain id', d.id);
        monsters.set(d.id, { ...d, mod: modId });
      },
      defineBrain(d) {
        if (!guard('defineBrain') || !checkId(d.id, 'brain')) return;
        fn(d.act, 'act', d.id);
        if (d.movement !== undefined) fn(d.movement, 'movement', d.id);
        brains.set(d.id, d);
      },
      defineObject(d) {
        if (!guard('defineObject') || !checkId(d.id, 'object')) return;
        str(d.nameKey, 'nameKey', d.id);
        if (d.descKey !== undefined) str(d.descKey, 'descKey', d.id);
        if (!OBJECT_CLASSES.includes(d.class))
          issue('class', `must be one of ${OBJECT_CLASSES.join(', ')}`, d.id);
        glyph(d.glyph, d.id);
        const int = (v: unknown, path: string, min: number, max: number): void => {
          if (!Number.isInteger(v) || (v as number) < min || (v as number) > max)
            issue(path, `must be an integer in [${min}, ${max}]`, d.id);
        };
        int(d.prob, 'prob', 0, 1000);
        int(d.weight, 'weight', 0, 100000);
        int(d.cost, 'cost', 0, 100000);
        int(d.delay, 'delay', 0, 100);
        str(d.material, 'material', d.id);
        bool(d.merge, 'merge', d.id);
        bool(d.magic, 'magic', d.id);
        const dice = (v: unknown, path: string): void => {
          if (!Array.isArray(v) || v.length !== 2) return issue(path, 'must be [n, d]', d.id);
          int(v[0], `${path}[0]`, 0, 100);
          int(v[1], `${path}[1]`, 0, 100);
        };
        if (d.weapon !== undefined) {
          dice(d.weapon.small, 'weapon.small');
          dice(d.weapon.large, 'weapon.large');
          int(d.weapon.hitBonus, 'weapon.hitBonus', -20, 20);
          str(d.weapon.skill, 'weapon.skill', d.id);
          bool(d.weapon.bimanual, 'weapon.bimanual', d.id);
          if (!['pierce', 'slash', 'whack'].includes(d.weapon.kind))
            issue('weapon.kind', "must be 'pierce', 'slash' or 'whack'", d.id);
          if (
            d.weapon.role !== undefined &&
            !['launcher', 'ammo', 'missile'].includes(d.weapon.role)
          )
            issue('weapon.role', "must be 'launcher', 'ammo' or 'missile'", d.id);
        }
        if (d.armor !== undefined) {
          if (!ARMOR_SLOTS.includes(d.armor.slot))
            issue('armor.slot', `must be one of ${ARMOR_SLOTS.join(', ')}`, d.id);
          int(d.armor.ac, 'armor.ac', -20, 20);
          int(d.armor.mc, 'armor.mc', 0, 3);
        }
        if (d.class === 'armor' && d.armor === undefined)
          issue('armor', 'armor objects need armor stats', d.id);
        if (d.food !== undefined) int(d.food.nutrition, 'food.nutrition', 0, 10000);
        if (d.prop !== undefined) str(d.prop, 'prop', d.id);
        if (d.wand !== undefined && !WAND_DIRS.includes(d.wand.dir))
          issue('wand.dir', `must be one of ${WAND_DIRS.join(', ')}`, d.id);
        if (d.class === 'wand' && d.wand === undefined)
          issue('wand', 'wand objects need wand.dir', d.id);
        if (d.container !== undefined) {
          if (d.container.capacity !== null)
            int(d.container.capacity, 'container.capacity', 0, 100000);
          bool(d.container.box, 'container.box', d.id);
          if (d.container.holding !== undefined)
            bool(d.container.holding, 'container.holding', d.id);
        }
        if (d.spellbook !== undefined) int(d.spellbook.level, 'spellbook.level', 0, 7);
        if (d.class === 'spellbook' && d.spellbook === undefined)
          issue('spellbook', 'spellbook objects need spellbook.level', d.id);
        if (d.boulder !== undefined && (d.boulder as unknown) !== true)
          issue('boulder', 'must be true when given', d.id);
        if (d.use !== undefined) fn(d.use, 'use', d.id);
        if (d.zap !== undefined) fn(d.zap, 'zap', d.id);
        objects.set(d.id, { ...d, mod: modId });
      },
      defineAppearance(d) {
        if (!guard('defineAppearance') || !checkId(d.id, 'appearance')) return;
        str(d.nameKey, 'nameKey', d.id);
        if (!OBJECT_CLASSES.includes(d.class))
          issue('class', `must be one of ${OBJECT_CLASSES.join(', ')}`, d.id);
        glyph(d.glyph, d.id);
        appearances.set(d.id, d);
      },
      defineStatus(d) {
        if (!guard('defineStatus') || !checkId(d.id, 'status')) return;
        str(d.field, 'field', d.id);
        fn(d.value, 'value', d.id);
        statuses.push({ ...d, mod: modId });
      },
      definePerception(d) {
        if (!guard('definePerception') || !checkId(d.id, 'perception')) return;
        const parts = ['blind', 'senses', 'shownAs', 'hides', 'self', 'lights'] as const;
        if (!parts.some((k) => d[k] !== undefined))
          issue('definePerception', `needs at least one of ${parts.join(', ')}`, d.id);
        for (const k of parts) if (d[k] !== undefined) fn(d[k], k, d.id);
        perceptions.push(d);
      },
      defineTrap(d) {
        if (!guard('defineTrap') || !checkId(d.id, 'trap')) return;
        str(d.nameKey, 'nameKey', d.id);
        glyph(d.glyph, d.id);
        if (d.hole !== undefined) bool(d.hole, 'hole', d.id);
        traps.set(d.id, d);
      },
      defineDungeon(d) {
        if (!guard('defineDungeon') || !checkId(d.id, 'dungeon')) return;
        str(d.nameKey, 'nameKey', d.id);
        const posInt = (v: unknown, path: string): void => {
          if (!Number.isInteger(v) || (v as number) < 1)
            issue(path, 'must be an integer >= 1', d.id);
        };
        const range = (v: unknown, path: string): void => {
          if (v !== undefined && (!Number.isInteger(v) || (v as number) < 0))
            issue(path, 'must be an integer >= 0', d.id);
        };
        if (d.levels !== undefined) {
          posInt(d.levels.base, 'levels.base');
          range(d.levels.range, 'levels.range');
        }
        if (d.entry !== undefined) {
          str(d.entry.from, 'entry.from', d.id);
          // with a chain level the base is relative to it and may be any integer
          if (d.entry.chain === undefined) posInt(d.entry.base, 'entry.base');
          else {
            str(d.entry.chain, 'entry.chain', d.id);
            if (!Number.isInteger(d.entry.base)) issue('entry.base', 'must be an integer', d.id);
          }
          range(d.entry.range, 'entry.range');
          if (d.entry.dir !== undefined && d.entry.dir !== 'up' && d.entry.dir !== 'down')
            issue('entry.dir', "must be 'up' or 'down'", d.id);
        }
        if (d.entryLevel !== undefined) {
          if (!Number.isInteger(d.entryLevel)) issue('entryLevel', 'must be an integer', d.id);
          else if (d.entry === undefined)
            issue('entryLevel', 'the root dungeon has no branch stairs to arrive by', d.id);
          else if (d.entryLevel < 0 && d.levels === undefined)
            issue('entryLevel', 'cannot count from the bottom of an endless dungeon', d.id);
        }
        if (d.filler !== undefined) str(d.filler, 'filler', d.id);
        if (d.special !== undefined) {
          if (!Array.isArray(d.special)) issue('special', 'must be an array', d.id);
          else
            d.special.forEach((sp, i) => {
              const at = `special[${i}]`;
              if (typeof sp !== 'object' || sp === null)
                return issue(at, 'must be an object', d.id);
              str(sp.id, `${at}.id`, d.id);
              if (d.special?.some((o, j) => j < i && o.id === sp.id))
                issue(`${at}.id`, `duplicate special level '${sp.id}'`, d.id);
              str(sp.nameKey, `${at}.nameKey`, d.id);
              if (!Number.isInteger(sp.base) || sp.base === 0)
                issue(`${at}.base`, 'must be a non-zero integer', d.id);
              range(sp.range, `${at}.range`);
              if (
                sp.chance !== undefined &&
                (!Number.isInteger(sp.chance) || sp.chance < 0 || sp.chance > 100)
              )
                issue(`${at}.chance`, 'must be an integer 0..100', d.id);
              if (!Array.isArray(sp.variants) || sp.variants.length === 0)
                issue(`${at}.variants`, 'must be a non-empty array of LevelDef ids', d.id);
              if (sp.town !== undefined && typeof sp.town !== 'boolean')
                issue(`${at}.town`, 'must be a boolean', d.id);
              // the base must be inside the dungeon however few levels it rolls
              const fewest = d.levels?.base;
              if (Number.isInteger(sp.base) && sp.base !== 0) {
                if (fewest === undefined && sp.base < 0)
                  issue(`${at}.base`, 'cannot count from the bottom of an endless dungeon', d.id);
                else if (fewest !== undefined && Math.abs(sp.base) > fewest)
                  issue(`${at}.base`, `is outside the dungeon (as few as ${fewest} levels)`, d.id);
              }
            });
        }
        dungeons.set(d.id, { ...d, mod: modId });
      },
      defineLevel(d) {
        if (!guard('defineLevel') || !checkId(d.id, 'level')) return;
        for (const [path, reason] of levelDefIssues(d)) issue(path, reason, d.id);
        levels.set(d.id, { ...d, mod: modId });
      },
      setItemNamer(namer) {
        if (!guard('setItemNamer')) return;
        if (typeof namer !== 'function') return issue('setItemNamer', 'must be a function');
        itemNamer = namer;
      },
      defineTimer(d) {
        if (!guard('defineTimer') || !checkId(d.id, 'timer')) return;
        fn(d.fire, 'fire', d.id);
        timers.set(d.id, d);
      },
      on<K extends HookName>(name: K, hookFn: Hooks[K], opts?: HookOptions) {
        if (!guard(`on('${String(name)}')`)) return;
        if (!HOOK_NAMES.includes(name)) {
          issue(`on('${String(name)}')`, `unknown hook; expected one of ${HOOK_NAMES.join(', ')}`);
          return;
        }
        const priority = opts?.priority ?? 0;
        if (!Number.isFinite(priority)) issue(`on('${name}').priority`, 'must be a finite number');
        if (typeof hookFn !== 'function') issue(`on('${name}')`, 'handler must be a function');
        hooks.push({ name, mod: modId, priority, fn: hookFn, order, seq: seq++ } as AnyHook & {
          name: HookName;
        });
      },
    };

    if (typeof mod.register === 'function') {
      try {
        mod.register(api);
      } catch (e) {
        issue('register', `threw: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    open = false;
    loaded.push({ id: modId, version: String(mod.version) });
  });

  // Cross-references are checked once every mod has registered.
  for (const t of terrains.values())
    if (t.looksLike !== undefined && !terrains.has(t.looksLike))
      issues.push({
        modId: t.id.split(':')[0] ?? '?',
        defId: t.id,
        path: 'looksLike',
        reason: `unknown terrain '${t.looksLike}'`,
      });
  for (const m of monsters.values())
    if (typeof m.brain === 'string' && !brains.has(m.brain))
      issues.push({
        modId: m.mod,
        defId: m.id,
        path: 'brain',
        reason: `unknown brain '${m.brain}'`,
      });

  for (const d of dungeons.values())
    if (typeof d.filler === 'string' && !levels.has(d.filler))
      issues.push({
        modId: d.mod,
        defId: d.id,
        path: 'filler',
        reason: `unknown level '${d.filler}'`,
      });
  for (const d of dungeons.values())
    (Array.isArray(d.special) ? d.special : []).forEach((sp, i) => {
      if (!Array.isArray(sp.variants)) return;
      sp.variants.forEach((v, j) => {
        if (typeof v !== 'string' || !levels.has(v))
          issues.push({
            modId: d.mod,
            defId: d.id,
            path: `special[${i}].variants[${j}]`,
            reason: `unknown level '${String(v)}'`,
          });
      });
    });
  for (const l of levels.values()) {
    const ref = (path: string, reason: string): void =>
      void issues.push({ modId: l.mod, defId: l.id, path, reason });
    if (l.init?.style === 'solidfill' || l.init?.style === 'mines')
      for (const key of ['fg', 'bg'] as const) {
        const id: unknown = (l.init as Record<string, unknown>)[key];
        if (typeof id === 'string' && !terrains.has(id))
          ref(`init.${key}`, `unknown terrain '${id}'`);
      }
    for (const [prefix, list] of contentLists(l)) {
      if (!Array.isArray(list)) continue;
      (list as LevelContent[]).forEach((c, i) => {
        if (typeof c !== 'object' || c === null) return;
        const known = c.kind === 'monster' ? monsters : c.kind === 'object' ? objects : traps;
        if (typeof c.id === 'string' && !known.has(c.id))
          ref(`${prefix}[${i}].id`, `unknown ${c.kind} '${c.id}'`);
        if (
          c.kind === 'monster' &&
          typeof c.class === 'string' &&
          [...c.class].length === 1 &&
          ![...monsters.values()].some((m) => m.glyph.ch === c.class)
        )
          ref(`${prefix}[${i}].class`, `no monster has glyph '${c.class}'`);
      });
    }
  }
  const dungeonList = orderDungeons(dungeons, issues);

  if (issues.length > 0) throw new ModLoadError(issues);

  const sortedHooks = [...hooks].sort(
    (a, b) => b.priority - a.priority || a.order - b.order || a.seq - b.seq,
  ) as (AnyHook & { name: HookName })[];
  const byName = new Map<HookName, RegisteredHook[]>();
  for (const name of HOOK_NAMES) {
    byName.set(
      name,
      sortedHooks
        .filter((h) => h.name === name)
        .map(({ mod, priority, fn }) => ({ mod, priority, fn })),
    );
  }
  const terrainList = [...terrains.values()];
  const roleList = [...roles.values()];

  const registry: Registry = {
    mods: loaded,
    terrain(id) {
      const t = terrains.get(id);
      if (!t) throw new Error(`Unknown terrain '${id}'`);
      return t;
    },
    hasTerrain: (id) => terrains.has(id),
    role(id) {
      const r = roles.get(id);
      if (!r) throw new Error(`Unknown role '${id}'`);
      return r;
    },
    timer(id) {
      const t = timers.get(id);
      if (!t) throw new Error(`Unknown timer '${id}'`);
      return t;
    },
    hasTimer: (id) => timers.has(id),
    monster(id) {
      const m = monsters.get(id);
      if (!m) throw new Error(`Unknown monster '${id}'`);
      return m;
    },
    isMonster: (id) => monsters.has(id),
    object(id) {
      const o = objects.get(id);
      if (!o) throw new Error(`Unknown object '${id}'`);
      return o;
    },
    isObject: (id) => objects.has(id),
    appearance(id) {
      const a = appearances.get(id);
      if (!a) throw new Error(`Unknown appearance '${id}'`);
      return a;
    },
    isAppearance: (id) => appearances.has(id),
    trap(id) {
      const t = traps.get(id);
      if (!t) throw new Error(`Unknown trap '${id}'`);
      return t;
    },
    isTrap: (id) => traps.has(id),
    dungeon(id) {
      const d = dungeonList.find((x) => x.id === id);
      if (!d) throw new Error(`Unknown dungeon '${id}'`);
      return d;
    },
    dungeons: dungeonList,
    level(id) {
      const l = levels.get(id);
      if (!l) throw new Error(`Unknown level '${id}'`);
      return l;
    },
    levels: [...levels.values()],
    itemName: (state, item) => itemNamer(state, registry, item),
    objects: [...objects.values()],
    appearances: [...appearances.values()],
    statuses,
    perceptions,
    traps: [...traps.values()],
    brain(id) {
      const b = brains.get(id);
      if (!b) throw new Error(`Unknown brain '${id}'`);
      return b;
    },
    monsters: [...monsters.values()],
    roles: roleList,
    terrains: terrainList,
    actions,
    hooks: <K extends HookName>(name: K) => byName.get(name) as RegisteredHook<K>[],
  };
  return Object.freeze(registry);
}

const CONTENT_KINDS = ['monster', 'object', 'trap'];

/**
 * Shape problems of a LevelDef as [path, reason]; references to other defs are checked once
 * every mod has registered. Written for data from anywhere, so nothing is assumed about types.
 */
function levelDefIssues(d: LevelDef): [string, string][] {
  const out: [string, string][] = [];
  const init: unknown = d.init;
  if (typeof init !== 'object' || init === null) out.push(['init', 'must be an object']);
  else {
    const fields = init as Record<string, unknown>;
    const { style, fg, bg } = fields;
    const bools = style === 'mines' ? ['smoothed', 'joined', 'walled', 'lit'] : ['lit'];
    if (style === 'solidfill' || style === 'mines') {
      if (typeof fg !== 'string' || fg === '') out.push(['init.fg', 'must be a terrain id']);
      if (style === 'mines' && bg !== undefined && (typeof bg !== 'string' || bg === ''))
        out.push(['init.bg', 'must be a terrain id']);
      for (const b of bools)
        if (fields[b] !== undefined && typeof fields[b] !== 'boolean')
          out.push([`init.${b}`, 'must be a boolean']);
    } else if (style !== 'rooms')
      out.push(['init.style', "must be 'rooms', 'solidfill' or 'mines'"]);
  }
  out.push(...specialLevelIssues(d));
  for (const [prefix, list] of contentLists(d)) contentIssues(prefix, list, out);
  return out;
}

/** Shape problems of one `contents` list at `prefix`. */
function contentIssues(prefix: string, contents: unknown, out: [string, string][]): void {
  if (!Array.isArray(contents)) return void out.push([prefix, 'must be an array']);
  contents.forEach((c: unknown, i) => {
    const at = `${prefix}[${i}]`;
    if (typeof c !== 'object' || c === null) return void out.push([at, 'must be an object']);
    const { kind, id, class: cls, count, percent, x, y, peaceful } = c as Record<string, unknown>;
    if (typeof kind !== 'string' || !CONTENT_KINDS.includes(kind))
      out.push([`${at}.kind`, `must be one of ${CONTENT_KINDS.join(', ')}`]);
    if (id !== undefined && (typeof id !== 'string' || id === ''))
      out.push([`${at}.id`, 'must be a def id']);
    if (cls !== undefined) {
      if (id !== undefined) out.push([`${at}.class`, 'give either id or class, not both']);
      else if (kind === 'trap') out.push([`${at}.class`, 'traps have no classes']);
      else if (kind === 'object' && !OBJECT_CLASSES.includes(cls as ObjectClass))
        out.push([`${at}.class`, `must be one of ${OBJECT_CLASSES.join(', ')}`]);
      else if (kind === 'monster' && (typeof cls !== 'string' || [...cls].length !== 1))
        out.push([`${at}.class`, 'must be one monster glyph character']);
    }
    const nat = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0;
    if (count !== undefined && !nat(count)) {
      const { min, max } = (typeof count === 'object' && count !== null ? count : {}) as Record<
        string,
        unknown
      >;
      if (!nat(min) || !nat(max) || (min as number) > (max as number))
        out.push([`${at}.count`, 'must be an integer >= 0 or { min, max } with 0 <= min <= max']);
    }
    if (percent !== undefined && (!nat(percent) || (percent as number) > 100))
      out.push([`${at}.percent`, 'must be an integer 0..100']);
    if ((x === undefined) !== (y === undefined))
      out.push([`${at}.${x === undefined ? 'x' : 'y'}`, 'give both x and y, or neither']);
    for (const [k, v] of [
      ['x', x],
      ['y', y],
    ] as const)
      if (v !== undefined && !Number.isInteger(v)) out.push([`${at}.${k}`, 'must be an integer']);
    if (peaceful !== undefined) {
      if (typeof peaceful !== 'boolean') out.push([`${at}.peaceful`, 'must be a boolean']);
      else if (kind !== 'monster') out.push([`${at}.peaceful`, 'only monsters can be peaceful']);
    }
  });
}

/**
 * Root first, then breadth-first, each dungeon's children in registration order. Reports a
 * missing or second root, unknown `entry.from`, an entry below the bottom of its parent, a
 * `chain` that is not an always-made special level of the parent, and
 * dungeons that cannot be reached from the root (a loop).
 */
function orderDungeons(
  dungeons: ReadonlyMap<string, DungeonDef & { mod: string }>,
  issues: ModLoadIssue[],
): DungeonDef[] {
  if (dungeons.size === 0) return [DEFAULT_DUNGEON];
  const all = [...dungeons.values()];
  for (const d of all) {
    if (!d.entry) continue;
    const parent = dungeons.get(d.entry.from);
    if (!parent)
      issues.push({
        modId: d.mod,
        defId: d.id,
        path: 'entry.from',
        reason: `unknown dungeon '${d.entry.from}'`,
      });
    else if (d.entry.chain !== undefined) {
      // ref: src/dungeon.c level_range(): an absent chain level panics, so it must always exist
      const sp = (Array.isArray(parent.special) ? parent.special : []).find(
        (x) => x.id === d.entry?.chain,
      );
      if (!sp)
        issues.push({
          modId: d.mod,
          defId: d.id,
          path: 'entry.chain',
          reason: `'${d.entry.chain}' is not a special level of '${parent.id}'`,
        });
      else if ((sp.chance ?? 100) !== 100)
        issues.push({
          modId: d.mod,
          defId: d.id,
          path: 'entry.chain',
          reason: `special level '${sp.id}' must always exist (chance 100)`,
        });
      else if (sp.base > 0 && sp.base + d.entry.base < 1)
        issues.push({
          modId: d.mod,
          defId: d.id,
          path: 'entry.base',
          reason: `is above the top of '${parent.id}'`,
        });
      else if (
        sp.base > 0 &&
        parent.levels &&
        sp.base + (sp.range || 1) - 1 + d.entry.base > parent.levels.base
      )
        issues.push({
          modId: d.mod,
          defId: d.id,
          path: 'entry.base',
          reason: `is below the bottom of '${parent.id}'`,
        });
    } else if (parent.levels && d.entry.base > parent.levels.base)
      issues.push({
        modId: d.mod,
        defId: d.id,
        path: 'entry.base',
        reason: `is below the bottom of '${parent.id}'`,
      });
  }
  const roots = all.filter((d) => !d.entry);
  if (roots.length !== 1) {
    const d = roots[1] ?? all[0];
    issues.push({
      modId: d?.mod ?? '?',
      ...(d ? { defId: d.id } : {}),
      path: 'entry',
      reason: `exactly one dungeon must have no entry (found ${roots.length})`,
    });
    return all;
  }
  const order = [roots[0] as DungeonDef & { mod: string }];
  for (let q = 0; q < order.length; q++)
    for (const d of all) if (d.entry?.from === order[q]?.id && !order.includes(d)) order.push(d);
  for (const d of all)
    if (!order.includes(d) && dungeons.has(d.entry?.from ?? ''))
      issues.push({
        modId: d.mod,
        defId: d.id,
        path: 'entry.from',
        reason: 'not reachable from the root dungeon',
      });
  return order;
}

/** Throws a ModLoadError if any of `ids` is not a registered terrain. */
export function requireTerrains(
  registry: Registry,
  ids: readonly DefId[],
  requiredBy: string,
): void {
  const missing = ids.filter((id) => !registry.hasTerrain(id));
  if (missing.length > 0) {
    throw new ModLoadError(
      missing.map((id) => ({
        modId: requiredBy,
        defId: id,
        path: 'terrain',
        reason: 'required terrain is not registered',
      })),
    );
  }
}
