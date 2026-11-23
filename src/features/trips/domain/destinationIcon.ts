/** The look of a trip, chosen from what its destination says. Anything not recognised is a plane. */
export type DestinationTheme = 'eiffel' | 'beach' | 'palm' | 'sea' | 'sun' | 'mountain' | 'snow' | 'city' | 'landmark' | 'nature' | 'plane'

/** The looks the person can pick by hand (the automatic ones also include palm, sea and the Eiffel Tower). */
export const PICKABLE_THEMES: readonly { theme: DestinationTheme; label: string }[] = [
  { theme: 'beach', label: 'Playa' },
  { theme: 'mountain', label: 'Montaña' },
  { theme: 'snow', label: 'Nieve' },
  { theme: 'sun', label: 'Sol' },
  { theme: 'city', label: 'Ciudad' },
  { theme: 'nature', label: 'Naturaleza' },
  { theme: 'landmark', label: 'Monumentos' },
  { theme: 'plane', label: 'Genérico' },
]

const ALL_THEMES: readonly string[] = ['eiffel', 'beach', 'palm', 'sea', 'sun', 'mountain', 'snow', 'city', 'landmark', 'nature', 'plane']

/** A theme stored by the person, or undefined when it is empty or not one of ours. */
export function asTheme(value: string | null | undefined): DestinationTheme | undefined {
  return value && ALL_THEMES.includes(value) ? (value as DestinationTheme) : undefined
}

/** Lowercase, no accents, words only, so "París" and "paris." match the same entry. */
const plain = (text: string) =>
  ` ${text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

const w = (list: string) => list.split(',').map((s) => s.trim())

/** Places first (a city or country decides), then general words about the kind of trip ("playa", "esquí"). */
const THEMES: ReadonlyArray<{ theme: DestinationTheme; words: readonly string[] }> = [
  { theme: 'eiffel', words: w('paris,francia,france,torre eiffel') },
  {
    theme: 'snow',
    words: w('ushuaia,las lenas,penitentes,chapelco,cerro catedral,cerro castor,valle nevado,caviahue,esqui,ski,nieve,glaciar,perito moreno,canada,islandia,noruega,finlandia,laponia,suecia,alpes,aspen,whistler,courchevel,bariloche invierno,bormio'),
  },
  {
    theme: 'palm',
    words: w('cancun,punta cana,caribe,hawaii,bali,maldivas,tulum,playa del carmen,riviera maya,aruba,bahamas,cuba,varadero,jamaica,republica dominicana,puerto rico,tailandia,phuket,koh samui,filipinas,fiji,costa rica,panama,brasil,bahia,porto seguro,porto de galinhas,fortaleza,natal,maceio,jericoacoara,salvador,san andres,cartagena,santa marta,tropical,palmeras,vietnam,zanzibar,seychelles,mauricio,tahiti,polinesia'),
  },
  {
    theme: 'beach',
    words: w('playa,playas,costa,isla,islas,rio de janeiro,rio,copacabana,florianopolis,camboriu,balneario camboriu,miami,punta del este,punta del diablo,rocha,cabo polonio,la paloma,jose ignacio,pinamar,villa gesell,carilo,mar de las pampas,mar del plata,miramar,necochea,las grutas,mar azul,san clemente,monte hermoso,pehuen co,acapulco,los cabos,cabo san lucas,puerto vallarta,mazatlan,cozumel,barbados,curazao,miami beach,cayo hueso,key west,malibu,san diego,copacabana,ipanema,ibiza,formentera,mallorca,menorca,tenerife,canarias,gran canaria,lanzarote,fuerteventura,mykonos,santorini,creta,croacia,dubrovnik,split,amalfi,positano,capri,sicilia,cerdena,niza,saint tropez,cannes,montecarlo'),
  },
  {
    theme: 'sea',
    words: w('portugal,lisboa,oporto,porto,algarve,madeira,azores,cascais,sintra,mar,oceano,marina,puerto,faro,lagos,costa azul,costa brava,costa del sol,malaga,marbella,cadiz,valencia,san sebastian,galicia,bretana,normandia,irlanda,escocia,gales,mar caspio,mar muerto,mar negro,uruguay,colonia,montevideo,chile costa,vina del mar,valparaiso,pucon lago,lago,lagos,laguna'),
  },
  {
    theme: 'sun',
    words: w('egipto,marruecos,marrakech,tunez,turquia,estambul,antalya,hurghada,sharm el sheikh,dubai,abu dhabi,qatar,israel,jordania,andalucia,sevilla,granada,cordoba espana,sahara,desierto,atacama,san pedro de atacama,mendoza sol,salinas grandes,sol,verano'),
  },
  {
    theme: 'mountain',
    words: w('bariloche,mendoza,salta,jujuy,tucuman,cafayate,purmamarca,tilcara,humahuaca,cordoba,sierras,merlo,villa carlos paz,la cumbre,tandil,sierra de la ventana,san martin de los andes,villa la angostura,el bolson,esquel,el calafate,el chalten,fitz roy,cerro,montana,montanas,volcan,cordillera,andes,aconcagua,uspallata,potrerillos,cacheuta,san rafael,malargue,cusco,cuzco,machu picchu,peru,bolivia,la paz,uyuni,ecuador,quito,colombia,medellin,suiza,himalaya,nepal,katmandu,tibet,patagonia,torres del paine,pucon,villarrica,puerto varas,chiloe,camping,trekking,senderismo,parque nacional,yosemite,yellowstone,rocosas,dolomitas,tirol,austria,monte'),
  },
  {
    theme: 'city',
    words: w('nueva york,new york,nyc,manhattan,buenos aires,caba,capital federal,rosario,chicago,los angeles,las vegas,san francisco,orlando,houston,boston,washington,seattle,estados unidos,eeuu,usa,toronto,vancouver,montreal,ciudad de mexico,mexico df,lima,bogota,santiago,sao paulo,brasilia,medellin ciudad,caracas,panama city,tokio,tokyo,osaka,kioto,japon,seul,corea,pekin,beijing,shanghai,hong kong,china,singapur,bangkok,hanoi,mumbai,delhi,india,sidney,sydney,melbourne,australia,nueva zelanda,johannesburgo,ciudad del cabo,londres,berlin,munich,alemania,amsterdam,holanda,paises bajos,bruselas,belgica,ciudad,urbano,shopping,compras'),
  },
  {
    theme: 'landmark',
    words: w('roma,italia,venecia,florencia,milan,napoles,turin,atenas,grecia,madrid,barcelona,espana,sevilla ciudad,toledo,praga,viena,budapest,varsovia,cracovia,polonia,rusia,moscu,san petersburgo,londres museo,inglaterra,reino unido,edimburgo,europa,mundial,museo,historia,vaticano,pompeya,egipto piramides,jerusalen'),
  },
]

/** The theme of a destination: its known place or words, otherwise a plane. The list grows by adding words, not by changing code. */
export function destinationTheme(destination: string): DestinationTheme {
  const text = plain(destination)
  for (const { theme, words } of THEMES) {
    if (words.some((word) => text.includes(` ${word} `) || text.includes(` ${word}s `))) return theme
  }
  return 'plane'
}
