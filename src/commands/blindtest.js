import { userApi } from '../util/spotify.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior, AudioPlayerStatus } from '@discordjs/voice';

export const data = {
  name: 'blindtest',
  description: 'Blindtest Spotify (30s preview)',
  options: [{ name: 'action', type: 3, required: true, choices: [{ name:'start', value:'start' }, { name:'stop', value:'stop' }] }]
};

const sessions = new Map(); // guildId -> { answer, player, connection }

export async function execute(interaction) {
  const action = interaction.options.getString('action', true);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const vc = member.voice.channel;

  if (action === 'start') {
    if (!vc) return interaction.reply({ content: 'Rejoins un vocal.', ephemeral: true });
    const api = await userApi(interaction.user.id); // on utilise le compte de celui qui lance
    const recs = (await api.getRecommendations({ seed_genres: ['pop','hip-hop','rock'], min_popularity: 50, limit: 50 })).body.tracks;
    const pick = recs.find(t => t.preview_url);
    if (!pick) return interaction.reply('Pas de preview dispo, réessaie.');

    const conn = joinVoiceChannel({ channelId: vc.id, guildId: vc.guild.id, adapterCreator: vc.guild.voiceAdapterCreator, selfDeaf: true });
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    conn.subscribe(player);
    player.play(createAudioResource(pick.preview_url));
    sessions.set(interaction.guildId, { answer: pick.name.toLowerCase(), player, connection: conn });
    await interaction.reply(`🎵 Blindtest ! Devinez le **titre** (30s)…`);

    player.on(AudioPlayerStatus.Idle, () => { try { conn.destroy(); } catch {} sessions.delete(interaction.guildId); });

    const collector = interaction.channel.createMessageCollector({ time: 30_000 });
    collector.on('collect', (m) => {
      const s = sessions.get(interaction.guildId);
      if (!s || m.author.bot) return;
      if (m.content.toLowerCase().includes(s.answer)) {
        m.reply(`✅ GG ${m.author}! C’était **${pick.name}** — ${pick.artists.map(a=>a.name).join(', ')}`);
        try { conn.destroy(); } catch {}
        sessions.delete(interaction.guildId);
        collector.stop();
      }
    });
  } else {
    const s = sessions.get(interaction.guildId);
    if (!s) return interaction.reply('Aucun blindtest en cours.');
    try { s.connection.destroy(); } catch {}
    sessions.delete(interaction.guildId);
    return interaction.reply('🛑 Blindtest stoppé.');
  }
}
