const ytdl = require('discord-ytdl-core')
const { Client } = require("youtubei");
const youtube = new Client();
const YTsearch = require('youtube-search');
const { MessageEmbed } = require('discord.js-light')
const { getLyrics } = require('genius-lyrics-api')
const { Readable } = require('stream');

const queue = new Map()

const ms = (o => {
    const h = Math.floor(o / 3600), m = Math.floor(o % 3600 / 60), s = Math.floor(o % 60)
    return `${0 != h ? h + "h " : ""}${0 != m ? m + "m " : ""}${0 != s ? s + 's' : ''}`;
});

const noResults = new Error('No results')

const getVideo = async (query) => {
    if (ytdl.validateURL(query) || ytdl.validateID(query)) {
        const info = await youtube.getVideo(query);

        if (!info) 
            throw noResults

        return {
            title: info.title,
            id: info.id,
            length: info.duration,
            live: info.isLive || info.isLiveContent,
            youtube: true
        }
    } 

    const videos = await youtube.search(query, {
        type: "video",
    });

    if (videos.length == 0) 
        throw noResults

    return {
        title: videos[0].title,
        id: videos[0].id,
        length: videos[0].duration,
        live: videos[0].isLive || videos[0].isLiveContent,
        youtube: true
    }
}

module.exports = (pl, cfg) => {
    pl.commands.add({
        base: 'join',
        execute: async (msg) => {
            if (!msg.member.voice.channel) return msg.channel.send(pl.localeString('radio.noVC'));
            const serverQueue = queue.get(msg.guild.id);

            msg.channel.send(pl.localeString('radio.joined', (await pl.getChannel(msg.member.voice.channel.id)).name, pl.format('{mention}', msg.channel)));
            if (serverQueue) {
                serverQueue.tc = msg.channel
            } else {
                queue.set({
                    tc: msg.channel
                })
            }
            msg.member.voice.channel.join()
        }
    })

    const play = async (song, tc, vc, connection) => {
        if (!connection) connection = await vc.join()

        connection.once("disconnect", () => {
            queue.delete(tc.guild.id);
        });
    
        const serverQueue = queue.get(tc.guild.id);
    
        const dispatcher = connection.play(
            song.youtube ? 
            await ytdl(
                song.id, 
                { 
                    opusEncoded: true,
                    // https://ffmpeg.org/ffmpeg-filters.html
                    // encoderArgs: ['-af', 'atempo=2']
                }
            ) : 
            await ytdl.arbitraryStream(
                song.streamLink, 
                { 
                    opusEncoded: true,
                    // https://ffmpeg.org/ffmpeg-filters.html
                    // encoderArgs: ['-af', 'atempo=2']
                }
            ), 
            { 
                type: "opus", 
                volume: serverQueue.volume / 100, 
                bitrate: 128 
            }
        );
    
        serverQueue.dispatcher = dispatcher;

        !serverQueue.tc ? serverQueue.tc = tc : undefined
    
        dispatcher.once("finish", async () => {
            !serverQueue.loop ? serverQueue.songs.shift() : undefined

            if (serverQueue.songs[0]) {
                serverQueue.tc.send(pl.localeString('radio.playing', serverQueue.songs[0].title, !serverQueue.songs[0].live ? ms(serverQueue.songs[0].length) : 'Livestream'));
                connection.removeAllListeners("disconnect");
                return play(serverQueue.songs[0], tc, null, connection);
            }
            serverQueue.tc.send(pl.localeString('radio.leaved'))
            serverQueue.dispatcher.player.voiceConnection.channel.leave();
        });
    } 

    pl.commands.add({
        base: 'play',
        aliases: ['p'],
        execute: async (msg, ...query) => {
            if (!msg.member.voice.channel) return msg.channel.send(pl.localeString('radio.noVC'));

            if (query.length === 0) return msg.channel.send(pl.localeString('radio.noQuery'));

            //const permissions = msg.member.voice.channel.permissionsFor(msg.client.user);
            //if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
            //    return msg.channel.send('I need the permissions to join and   speak in your voice channel!');
            //}

            let serverQueue = queue.get(msg.guild.id);

            let song

            try {
                song = await getVideo(query.join(' '), cfg.youtubeApi)
            } catch (e) {
                return msg.channel.send(pl.localeString('radio.notFound', query.join(' ')));
            }

            if (!queue.has(msg.guild.id)) {
                queue.set(msg.guild.id, {
                    songs: [song],
                    volume: 100,
                    tc: msg.channel,
                    vc: msg.member.voice.channel
                });

                serverQueue = queue.get(msg.guild.id);
        
                play(song, msg.channel, msg.member.voice.channel);

                serverQueue.tc.send(pl.localeString('radio.playing', song.title, !song.live ? ms(song.length) : 'Livestream'));
            } else {
                serverQueue.songs.push(song);
                msg.channel.send(pl.localeString('radio.queue.add', song.title))
            }
        }
    })

    pl.commands.add({
        base: 'leave',
        execute(msg) {
            const serverQueue = queue.get(msg.guild.id);

            if (serverQueue && serverQueue.dispatcher && serverQueue.dispatcher.player.voiceConnection.channel) {
                serverQueue.songs = []
                return serverQueue.dispatcher.end()
            }

            msg.channel.send(pl.localeString('radio.leave_noVC'))
        }
    })

    pl.commands.add({
        base: 'pause',
        execute(msg) {
            const serverQueue = queue.get(msg.guild.id);

            if (serverQueue && serverQueue.dispatcher) {
                if(serverQueue.dispatcher.paused) {
                    serverQueue.tc.send(pl.localeString('radio.resumed'))
                    serverQueue.dispatcher.resume() 
                } else {
                    serverQueue.tc.send(pl.localeString('radio.paused'))
                    serverQueue.dispatcher.pause()
                }
            }
        }
    })

    pl.commands.add({
        base: 'set',
        execute(msg, [ key, value ]) {
            const serverQueue = queue.get(msg.guild.id);

            if (serverQueue && serverQueue.dispatcher) {
                switch (key) {
                    case 'vol':
                    case 'volume': {
                        if (!value) return msg.channel.send(pl.localeString('radio.settings.key.volume.current', serverQueue.dispatcher.volume * 100))

                        msg.channel.send(pl.localeString('radio.settings.key.volume.set', value * 100))
                        serverQueue.dispatcher.setVolume(value)
                        break
                    }
                    case 'loop': {
                        msg.channel.send(pl.localeString('radio.settings.key.loop.' + !serverQueue.loop))
                        serverQueue.loop = !serverQueue.loop 
                        break
                    }
                    case undefined: {
                        return msg.channel.send(pl.localeString('radio.settings.key.notSpecified'))
                    }
                    default: {
                        return msg.channel.send(pl.localeString('radio.settings.key.notFound'))
                    }
                }
            }
        }
    })

    pl.commands.add({
        base: 'q',
        aliases: ['queue'],
        execute(msg) {
            const serverQueue = queue.get(msg.guild.id);

            if (serverQueue) {
                const embed = new MessageEmbed()
                embed.setTitle(pl.localeString('radio.queue.embedName', msg.guild.name))
                embed.setDescription(`Loop: ${serverQueue.loop} | Volume: ${serverQueue.dispatcher.volume * 100}% | Paused: ${serverQueue.dispatcher.paused}`)
                serverQueue.songs.forEach((song, i) => {
                    embed.addField(`\`${song.title}\``, pl.localeString('radio.queue.info', 
                        !song.live ? 
                        i === 0 ? 
                            ms(song.length - serverQueue.dispatcher.streamTime / 1000) + ' / ' + ms(song.length) 
                            : ms(song.length) 
                        : 'Livestream', 
                        `[YouTube](https://www.youtube.com/watch?v=${song.id})`))
                })
                msg.channel.send(embed)
            }
        }
    })

    pl.commands.add({
        base: 'fs',
        aliases: ['fastskip', 'skip', 's'],
        execute: async (msg) => {
            const serverQueue = queue.get(msg.guild.id);

            if(serverQueue && serverQueue.dispatcher) {
                serverQueue.tc.send(pl.localeString('radio.skipped'))
                serverQueue.dispatcher.end();
                if(serverQueue.loop) serverQueue.songs.shift()
            }
        }
    })

    /* TODO */
    pl.commands.add({
        base: 'ps',
        aliases: ['playskip'],
        execute: async (msg, ...query) => {
            const serverQueue = queue.get(msg.guild.id);

            if(serverQueue && serverQueue.dispatcher) {
                if (query.length === 0) return msg.channel.send(pl.localeString('radio.noQuery'));

                try {
                    song = await getVideo(query.join(' '), cfg.youtubeApi)
                } catch (e) {
                    return msg.channel.send(pl.localeString('radio.notFound', query.join(' ')));
                }

                serverQueue.songs.push(song);
                serverQueue.dispatcher.end();
                if(serverQueue.loop) serverQueue.songs.shift()
            }
        }
    })

    pl.commands.add({
        base: 'stop',
        execute: async (msg) => {
            const serverQueue = queue.get(msg.guild.id);
            
            if(serverQueue && serverQueue.dispatcher) {
                serverQueue.songs = []
                serverQueue.dispatcher.end();
            }
        }
    })

    pl.commands.add({
        base: 'seek',
        execute: async (msg) => {
            const serverQueue = queue.get(msg.guild.id);
            
            if(serverQueue && serverQueue.dispatcher) {
                
            }
        }
    })

    pl.commands.add({
        base: 'lyrics',
        execute: async (msg) => {
            const serverQueue = queue.get(msg.guild.id);
            
            if(serverQueue) {
                msg.channel.send(pl.localeString('radio.lyrics.wait'))
                .then(message => {
                    getLyrics({
                        apiKey: cfg.geniusKey,
                        title: serverQueue.songs[0].title,
                        artist: ''
                    }).then(lyrics => {
                        if(lyrics === null)
                            return msg.channel.send(pl.localeString('radio.lyrics.notFound'))
                        const lyricsSplitted = lyrics.match(/(.|[\r\n]){1,2000}/g);
                        lyricsSplitted.forEach(s => {
                            const embed = new MessageEmbed()
                            .setTitle(pl.localeString('radio.lyrics.for', serverQueue.songs[0].title))
                            .setDescription(s)
                            serverQueue.tc.send(embed)
                        })
                    }).catch(err => {
                        console.log(err)
                        msg.channel.send(pl.localeString('radio.lyrics.notFound'))
                    }).finally(_ => {
                        message.delete()
                    })
                })
            }
        }
    })
}