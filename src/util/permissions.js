export function isOwner(id) {
  return process.env.OWNER_ID && id === process.env.OWNER_ID;
}
export function hasDJ(member) {
  const id = process.env.DJ_ROLE_ID;
  if (!id) return true;
  return member.roles.cache.has(id) || member.permissions.has('Administrator');
}
export function guardDJ(interaction) {
  const m = interaction.guild.members.cache.get(interaction.user.id);
  if (!hasDJ(m)) throw new Error('DJ_ONLY');
}
