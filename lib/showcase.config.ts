// aliases: extra name variations to try when matching a teamsheet entry to a profile
export type TeamEntry = {
  number: number
  position: string | null
  name: string | null
  aliases?: string[]
  goals?: number
  assists?: number
}

export const showcaseConfig = {
  eventTitle: 'Showcase Game 1',
  eventSubtitle: '28 players. Steps 3–7.',
  bodyText: '28 platform players. Coaches and scouts from across the non-league pyramid. Everyone had a chance to perform and get seen.',

  youtubeVideoId: 'idKijVj2BUw',

  stats: [
    { value: '28', label: 'Players' },
    { value: 'Sold Out', label: 'Event' },
    { value: '3–7', label: 'Steps' },
  ],

  galleryUrl: 'https://pjphotography49.pixieset.com/next11ventrialday/',

  images: [
    '/showcase/A7D82D72-F7EE-4EA0-9FB7-83897CA970F3.JPG',
    '/showcase/IMG_9437.JPEG',
    '/showcase/IMG_9439.JPG',
    '/showcase/IMG_9468 2.JPEG',
    '/showcase/IMG_9516 2.JPG',
    '/showcase/IMG_9605.JPG',
    '/showcase/IMG_9608.JPG',
  ],

  teams: [
    {
      name: 'Team 1',
      kit: 'White',
      accentColor: '#e8dece',
      players: [
        { number: 1,  position: 'GK',    name: 'Connor Beard',      aliases: ['Conor Beard'] },
        { number: 2,  position: 'RB',    name: 'Chris Pinto' },
        { number: 3,  position: 'LB',    name: 'Anjola Onasanya' },
        { number: 4,  position: 'CB',    name: 'Tkai Myers Jones',  aliases: ['Tkai Myers-Jones', 'T\'kai Myers Jones'] },
        { number: 5,  position: 'CB',    name: 'Derek Imooye' },
        { number: 6,  position: 'CM',    name: 'Hartley Barrett' },
        { number: 7,  position: 'RW',    name: 'Ryan Smith' },
        { number: 8,  position: 'CM',    name: null },
        { number: 9,  position: 'ST',    name: 'Kanye Rico' },
        { number: 10, position: 'CAM',   name: 'Muller Kidu' },
        { number: 11, position: 'LW',    name: 'Joel Obosa' },
        { number: 12, position: 'LW',    name: 'Liam Wood' },
        { number: 14, position: 'CM',    name: null },
        { number: 15, position: 'ST/CB', name: 'Emmanuel Ansahin' },
        { number: 16, position: 'CM',    name: 'Taonga Nyimbili' },
      ],
    },
    {
      name: 'Team 2',
      kit: 'Orange',
      accentColor: '#f97316',
      players: [
        { number: 1,  position: 'GK',  name: 'Joe Taylor',    assists: 1 },
        { number: 2,  position: 'RB',  name: 'Ahmed Ibrahim' },
        { number: 3,  position: 'CB',  name: 'Daniel Olorundare',  aliases: ['Olorundare Daniel'] },
        { number: 4,  position: 'CB',  name: 'Oliver Monday' },
        { number: 5,  position: 'CB',  name: 'Kieron Jones' },
        { number: 6,  position: 'CM',  name: 'Igor Olechowski' },
        { number: 7,  position: 'RW',  name: 'Abel Tsegay' },
        { number: 8,  position: 'CM',  name: 'Harry Morgan' },
        { number: 9,  position: 'ST',  name: 'Ahmed Hassan' },
        { number: 10, position: 'CAM', name: 'Lewis Royle',  goals: 1, assists: 1 },
        { number: 11, position: 'LW',  name: 'Ivan Itono',    goals: 2 },
        { number: 12, position: null,  name: null },
        { number: 14, position: 'CM',  name: 'Ubaydulah Imtiaz',  aliases: ['Ubaydullah Imtiaz', 'Ubaydulah Imtiaz'] },
        { number: 15, position: 'LW',  name: 'Mohamad Karim' },
        { number: 16, position: 'RW',  name: null },
      ],
    },
  ],
}
