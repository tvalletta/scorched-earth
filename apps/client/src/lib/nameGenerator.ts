const ADJECTIVES = [
  'Iron','Steel','Chaos','Storm','Shadow','Blaze','Frost','Thunder',
  'Venom','Savage','Rogue','Grim','Crimson','Neon','Dark','Wild',
  'Turbo','Doom','Hyper','Volt',
];
const NOUNS = [
  'Wolf','Falcon','Shark','Bear','Eagle','Fox','Cobra','Tiger',
  'Hawk','Viper','Panther','Dragon','Lynx','Raven','Hornet',
  'Scorpion','Phantom','Raptor','Mamba','Jackal',
];

export function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]!;
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]!;
  return adj + noun;
}
