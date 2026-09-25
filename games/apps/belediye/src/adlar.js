// ─── Ad zarı: aday kaydında rastgele "Ad Soyad" ──────────────────────────
// k: kadın, e: erkek adları (BASKANLAR'daki cins). ADLAR_ORTAK iki cinse de konan adlar, iki havuzda da var.
// Gerçek kişi yok: tanınmış siyasetçi ve ünlü soyadları havuza girmez (YASAK_SOYAD), soyadı sıradan olan ünlülerin
// tam adı üretilemez (YASAK_TAM), tek bir siyasetçiyle özdeşleşmiş adlar da yok (YASAK_AD). test/adlar.test.mjs sınar.
const ADLAR_ORTAK = ["Deniz", "Derya", "Evren", "Umut", "Ümit", "Ekin", "Bilge", "Tuna", "Toprak", "Ayhan", "Işık", "Yüksel", "Hikmet", "Nurhan", "Özgür", "Servet"];
const ADLAR = {
  k: [...ADLAR_ORTAK,
    // eski usul, ninelerden
    "Ayşe", "Fatma", "Emine", "Hatice", "Zeynep", "Meryem", "Havva", "Hanife", "Zehra", "Hacer", "Hediye", "Hafize", "Hayriye", "Saadet",
    "Naciye", "Nazife", "Nuriye", "Şükriye", "Zekiye", "Remziye", "Bedriye", "Fahriye", "Hamiyet", "Makbule", "Mukaddes", "Münevver",
    "Müzeyyen", "Nebahat", "Nezihe", "Pakize", "Refika", "Sabiha", "Safiye", "Semiha", "Şaziye", "Şefika", "Şerife", "Türkan", "Vesile",
    "Zübeyde", "Fikriye", "Latife", "Cemile", "Adile", "Bahriye", "Dilber", "Fadime", "Gülizar", "Gülsüm", "Gülbahar", "Güllü", "Hatun",
    "Sakine", "Keziban", "Kiraz", "Nazik", "Döndü", "Elmas", "Dudu", "Zöhre", "Cennet", "Hüsniye", "Lütfiye", "Munise", "Zülfiye", "Esme",
    "Asiye", "Menekşe", "Gülendam", "Yeter", "Nazmiye", "Nadide", "Melahat", "Mualla", "Muazzez", "Mükerrem", "Mürüvvet", "Naime",
    "Necmiye", "Sabahat", "Saniye", "Leman", "Rukiye", "Kadriye", "Zahide", "Zeliha", "Ümmühan", "Selvi", "Dürdane",
    // annelerden, teyzelerden
    "Aynur", "Ayten", "Aysel", "Ayfer", "Aygül", "Ayla", "Aysun", "Asuman", "Aliye", "Arzu", "Bahar", "Banu", "Berrin", "Birsen", "Birgül",
    "Canan", "Cahide", "Demet", "Dilek", "Emel", "Esma", "Filiz", "Figen", "Fidan", "Gönül", "Gülten", "Gülay", "Gülşen", "Güler", "Gülcan",
    "Gülnur", "Gülseren", "Gülhan", "Handan", "Hülya", "Hale", "Halide", "Hayat", "İlknur", "İnci", "Lale", "Leyla", "Melek", "Meltem",
    "Mine", "Necla", "Nejla", "Nesrin", "Neslihan", "Nevin", "Nilgün", "Nilüfer", "Nihal", "Nazan", "Nazlı", "Nimet", "Nurten", "Nurcan",
    "Nuray", "Nursel", "Nurdan", "Nurgül", "Nurhayat", "Oya", "Özlem", "Perihan", "Pervin", "Pınar", "Semra", "Sevgi", "Sevim", "Sevda",
    "Sevil", "Sevinç", "Seher", "Selma", "Serpil", "Sibel", "Songül", "Suna", "Sultan", "Şenay", "Şengül", "Şermin", "Şükran", "Tülay",
    "Tülin", "Ümran", "Ülkü", "Yıldız", "Zerrin", "Zühal", "Serap", "Sema", "Sevtap", "Süheyla", "Şahika", "Yasemin", "Yurdagül", "Müjde",
    "Nükhet", "Sezen", "Selda", "Aydan", "Aslı",
    // yeni kuşak
    "Ayça", "Aylin", "Ayşegül", "Başak", "Begüm", "Berna", "Betül", "Burcu", "Büşra", "Cansu", "Ceren", "Damla", "Didem", "Duygu", "Ebru",
    "Ece", "Eda", "Elif", "Esin", "Esra", "Ezgi", "Gamze", "Gizem", "Gökçe", "Gözde", "Hande", "Hazal", "Işıl", "İpek", "İrem", "Kübra",
    "Melike", "Melis", "Merve", "Özge", "Pelin", "Seda", "Selin", "Sena", "Şeyma", "Şule", "Tuba", "Tuğba", "Tuğçe", "Yağmur", "Buse",
    "Beyza", "Ecrin", "Eylül", "Defne", "Nehir", "Azra", "Zümra", "Irmak", "Ela", "Elçin", "Nisa", "Ceyda", "Derin", "Duru", "Öykü", "Rüya",
    "Simge", "Ilgın", "Alara", "Beren", "Çağla", "Dilara", "Feyza", "İlayda", "Sude", "Yaren", "Aleyna", "Hilal", "Sümeyye", "Rabia",
    "Kevser", "Elvan", "Cemre", "Hira",
    // doğudan
    "Berfin", "Rojda", "Zelal", "Dilan", "Helin", "Berivan", "Evin", "Delal", "Dicle"],
  e: [...ADLAR_ORTAK,
    // eski usul, dedelerden
    "Mehmet", "Mustafa", "Ahmet", "Ali", "Hasan", "Hüseyin", "İbrahim", "İsmail", "Osman", "Yusuf", "Murat", "Ömer", "Ramazan", "Halil",
    "Süleyman", "Abdullah", "Mahmut", "Salih", "Kemal", "Orhan", "Şükrü", "Veli", "Yakup", "Yaşar", "Zeki", "Fikri", "Fehmi", "Hilmi",
    "Hamdi", "Hayri", "Kadir", "Kamil", "Kazım", "Lütfi", "Macit", "Muammer", "Muzaffer", "Münir", "Nazım", "Necati", "Necdet", "Nedim",
    "Nihat", "Nurettin", "Nusret", "Rahmi", "Rasim", "Refik", "Remzi", "Rıfat", "Rüstem", "Sabri", "Sadık", "Sadettin", "Saffet", "Sami",
    "Sedat", "Selami", "Sıtkı", "Suphi", "Şaban", "Şevket", "Şefik", "Tahsin", "Tevfik", "Vahit", "Yahya", "Yunus", "Zekeriya", "Ziya",
    "Adem", "Adnan", "Agah", "Akif", "Alaattin", "Arif", "Asım", "Atıf", "Avni", "Aziz", "Bahri", "Bayram", "Bedri", "Burhan", "Cafer",
    "Celal", "Cemal", "Cemil", "Cevat", "Cevdet", "Cumali", "Dursun", "Durmuş", "Emin", "Esat", "Eşref", "Faik", "Fahri", "Faruk", "Fazıl",
    "Ferit", "Fethi", "Fevzi", "Fuat", "Galip", "Haydar", "Hayrettin", "Hamza", "Hurşit", "İhsan", "İlhan", "İlyas", "İrfan", "İsa",
    "İzzet", "Kenan", "Kerim", "Latif", "Mahir", "Mecit", "Memduh", "Musa", "Mümtaz", "Naci", "Nafiz", "Necip", "Nevzat", "Niyazi", "Nuh",
    "Ragıp", "Reşat", "Sait", "Sefer", "Selim", "Seyfi", "Seyit", "Sırrı", "Şakir", "Şemsettin", "Şerafettin", "Tacettin", "Tayyar",
    "Temel", "Vasfi", "Zihni", "Zülfü", "Hıdır", "İdris", "Kadri", "Şerif", "Hayrullah", "Veysel", "Cuma", "Abdurrahman", "Seyfettin",
    "Zeynel", "Bilal", "Nezir", "Nurullah", "Hamit", "Hakkı", "Tahir", "Talip", "Yıldırım", "İsmet", "Necmi", "Rıdvan",
    // babalardan, amcalardan
    "Metin", "Ergün", "Erol", "Oktay", "Tekin", "Turan", "Zafer", "Mesut", "Bülent", "Erdal", "Altan", "Ercan", "Erhan", "Erkan", "Ersin",
    "Ertan", "Engin", "Coşkun", "Gürkan", "Hüsnü", "Levent", "Serdar", "Serkan", "Soner", "Taner", "Tamer", "Uğur", "Ufuk", "Volkan",
    "Yavuz", "Yücel", "Aydın", "Bora", "Cem", "Cenk", "Cüneyt", "Ferhat", "Gökhan", "Halit", "Haluk", "Hakan", "Kıvanç", "Koray", "Orçun",
    "Okan", "Oğuz", "Ozan", "Selçuk", "Semih", "Sermet", "Şenol", "Tolga", "Tanju", "Aykut", "Aytaç", "Barış", "Emrah", "Erdem",
    "Ertuğrul", "Gültekin", "Kürşat", "Mete", "Nejat", "Onur", "Rüştü", "Şener", "Tayfun", "Turgay", "Ferdi", "Naim", "Tugay", "Sinan",
    // yeni kuşak
    "Oğuzhan", "Kerem", "Mert", "Alper", "Alp", "Anıl", "Arda", "Batuhan", "Berk", "Berkay", "Can", "Caner", "Cihan", "Çağatay", "Çağlar",
    "Doruk", "Efe", "Emir", "Emre", "Enes", "Eren", "Fatih", "Furkan", "Görkem", "Güven", "Harun", "Ilgaz", "İlker", "Sercan", "Tunahan",
    "Tuğrul", "Utku", "Yiğit", "Eymen", "Miraç", "Aras", "Atlas", "Kuzey", "Çınar", "Poyraz", "Alperen", "Doğukan", "Taha", "Yağız",
    "Muhammet", "Mücahit", "Kutay", "Göktuğ", "Batu", "Ege", "Emirhan", "Kağan", "Mirza", "Ata",
    // doğudan
    "Baran", "Serhat", "Azad", "Diyar"],
};

// Soyadları: çoğu sıradan; sonda mahallenin esnafı ve lakaptan dönme olanlar (tatlı sert, abartısız).
// BASKANLAR'ın soyadları burada yok: zar başka bir adayın adını vermesin.
const SOYADLAR = [
  "Acar", "Akay", "Akbaş", "Akçay", "Akdağ", "Akdemir", "Akdeniz", "Akgöz", "Akgün", "Akgül", "Akın", "Akkaya", "Akkoyun", "Akkuş",
  "Akman", "Akpınar", "Aksoy", "Aksu", "Aktaş", "Aktürk", "Akyol", "Akyüz", "Alagöz", "Alkan", "Alp", "Altay", "Altıntaş", "Altınok",
  "Altun", "Arıoğlu", "Arslan", "Aslan", "Aslantaş", "Aşkın", "Atalay", "Atasoy", "Ateş", "Avcı", "Ay", "Aydemir", "Aydın", "Aydınlı",
  "Aydoğan", "Aydoğdu", "Aygün", "Ayhan", "Aykaç", "Aytaç", "Aytekin", "Ayvaz", "Ayyıldız", "Azak",
  "Babaoğlu", "Bağcı", "Bahadır", "Bakır", "Balcı", "Balık", "Baltacı", "Baran", "Başar", "Başoğlu", "Baştürk", "Batur", "Bayır", "Bayrak",
  "Bayram", "Baysal", "Bektaş", "Benli", "Berber", "Bilen", "Bilgili", "Bilgin", "Bilir", "Bozdoğan", "Bozkurt", "Bozoğlu", "Boztepe",
  "Budak", "Bulut", "Büyük",
  "Candemir", "Canpolat", "Cebeci", "Cihan", "Coşkun", "Cömert",
  "Çakar", "Çakır", "Çakmak", "Çalışkan", "Çallı", "Çam", "Çamlı", "Çayır", "Çelebi", "Çelik", "Çetin", "Çetiner", "Çetinkaya", "Çevik",
  "Çiçek", "Çiftçi", "Çınar", "Çırak", "Çoban", "Çolak",
  "Dağ", "Dağlı", "Demir", "Demirci", "Demirkaya", "Demirkol", "Deniz", "Dere", "Dikmen", "Dilek", "Dinç", "Doğanay", "Doğru", "Dönmez",
  "Duman", "Duran", "Durmaz", "Dursun", "Duru",
  "Ekici", "Elmas", "Er", "Erden", "Erdem", "Erdinç", "Eren", "Ergin", "Ergün", "Erkal", "Erkan", "Erkmen", "Erkoç", "Erol", "Ertan",
  "Ertekin", "Erten", "Ertürk", "Esen", "Eser",
  "Fidan",
  "Gedik", "Gencer", "Genç", "Gezer", "Gök", "Gökay", "Gökçe", "Gökmen", "Göksu", "Göktaş", "Gönen", "Gönül", "Güleç", "Güler", "Gültekin",
  "Gümüş", "Günay", "Gündoğdu", "Gündüz", "Güneş", "Güney", "Güngör", "Güngören", "Gür", "Gürbüz", "Gürel", "Gürler", "Gürsoy", "Güven",
  "Güzel", "Güçlü",
  "Hacıoğlu", "Harman", "Hatipoğlu", "Hazar", "Hekimoğlu",
  "Irmak", "Işık", "İlhan", "İnan", "İpek", "İşcan",
  "Kaçar", "Kadıoğlu", "Kahraman", "Kalender", "Kalkan", "Kanat", "Kandemir", "Kaplan", "Kaptan", "Kara", "Karabacak", "Karabulut",
  "Karaca", "Karadağ", "Karadeniz", "Karagöz", "Karahan", "Karakaya", "Karakoç", "Karakuş", "Karaman", "Karaoğlu", "Karasu", "Karataş",
  "Karayel", "Kartal", "Kavak", "Kaya", "Kayacan", "Kayalı", "Kayhan", "Kaymaz", "Kaynak", "Keçeli", "Keleş", "Keskin", "Kılıç", "Kılınç",
  "Kınalı", "Kıran", "Kırmızı", "Kiraz", "Kızıl", "Koca", "Kocaman", "Kocaoğlu", "Kocatürk", "Koçak", "Konuk", "Korkmaz", "Korkut",
  "Koyuncu", "Köse", "Kozan", "Kurt", "Kurtoğlu", "Kurtuluş", "Kuş", "Kutlu", "Küçük",
  "Laçin", "Mercan", "Mert", "Mete", "Metin", "Mutlu",
  "Oğuz", "Okur", "Olgun", "Onat", "Oral", "Oruç", "Ozan", "Önal", "Öner", "Ökten", "Öksüz", "Özalp", "Özbek", "Özbey", "Özcan", "Özden",
  "Özdemir", "Özdoğan", "Özer", "Özgül", "Özgür", "Özkan", "Özkaya", "Özmen", "Özsoy", "Öztekin", "Öztop", "Öztürk", "Özyurt",
  "Pala", "Parlak", "Pehlivan", "Polat", "Poyraz", "Pınar",
  "Sağlam", "Saraç", "Sarı", "Sarıkaya", "Sarıoğlu", "Savaş", "Sayar", "Seçkin", "Selçuk", "Serin", "Sevim", "Sevinç", "Sezgin", "Sipahi",
  "Solmaz", "Soydan", "Sönmez", "Sucu", "Sümer", "Sungur",
  "Şahin", "Şahinoğlu", "Şanlı", "Şeker", "Şen", "Şengül", "Şenol", "Şimşek",
  "Taş", "Taşdemir", "Taşkın", "Tatlı", "Tekeli", "Tekin", "Tekkaya", "Temiz", "Tepe", "Terzi", "Terzioğlu", "Tezcan", "Tok", "Tokgöz",
  "Topal", "Topaloğlu", "Topçu", "Toprak", "Tosun", "Tuğrul", "Tuna", "Tunç", "Tuncer", "Turan", "Turgut", "Turhan", "Türkmen",
  "Türkyılmaz",
  "Uçar", "Uğur", "Uluç", "Uludağ", "Uslu", "Uyar", "Uysal", "Uzun", "Uzunoğlu", "Ünal", "Ünlü", "Üstün",
  "Varol", "Yalçın", "Yaman", "Yanık", "Yaşar", "Yavuz", "Yazıcı", "Yazgan", "Yeşil", "Yetkin", "Yiğit", "Yıldırım", "Yıldız", "Yılmaz",
  "Yoldaş", "Yolcu", "Yurdakul", "Yurt", "Yurttaş", "Yücel", "Yüksel", "Zengin", "Zeybek",
  // çarşının, mahallenin soyadları
  "Semaverci", "Tespihçi", "Kavunoğlu", "Pekmezci", "Helvacı", "Simitçi", "Leblebici", "Turşucu", "Yoğurtçu", "Çaycıoğlu", "Demlikçi",
  "Cezveci", "Fincancı", "Kazancı", "Hamurcu", "Börekçi", "Çorbacı", "Lokumcu", "Kaymakçı", "Peynirci", "Sütçü", "Pastırmacı", "Sucukçu",
  "Zeytinci", "Üzümcü", "İncirci", "Cevizci", "Fındıkçı", "Karpuzcu", "Pancarcı", "Harmancı", "Değirmenci", "Orakçı", "Kağnıcı",
  "Nalbant", "Semerci", "Palancı", "Kalburcu", "Hasırcı", "Kilimci", "Yorgancı", "Keçeci", "Düğmeci", "Şemsiyeci", "Basmacı", "Saatçi",
  "Kantarcı", "Mühürcü", "Arzuhalci", "Fenerci", "Lambacı", "Kandilci", "Sobacı", "Oduncu", "Kömürcü", "Kibritçi", "Soğancı", "Biberci",
  "Tuzcu", "Ihlamurcu", "Tütüncü", "Kehribarcı", "Aynacı", "Tarakçı", "Horozoğlu", "Arıcı", "Çeşmeci", "Söğütlü", "Karakavaklı",
  "Uzunkavak", "Pişmaniyeci", "Bozacı", "Salepçi", "Şerbetçi", "Gazozcu", "Macuncu", "Kestaneci", "Baklavacı", "Sepetçi", "Çömlekçi",
  "Bakırcı", "Tenekeci", "Boyacıoğlu", "Kiremitçi", "Kerpiççi", "Sakallı", "Kıvırcık", "Dertsiz", "Gamsız", "Çokbilir", "Hepgüler",
  "Bilgiç", "Söylemez", "Duymaz", "Unutmaz", "Yorulmaz", "Yağcı", "Uyanık", "Üçüncü", "Birinci", "Demirbaş", "Okumuş", "Ekşi",
  "Kabadayı", "Karabıyık", "Hamamcı",
];

// Tanınmış siyasetçilerin (cumhurbaşkanı, başbakan, parti lideri, bakan, büyükşehir başkanı) ve ünlülerin
// gönderme gibi okunacak soyadları. Hiçbiri havuza girmez; girse bile üretici eler.
const YASAK_SOYAD = [
  // cumhurbaşkanları, başbakanlar, erken cumhuriyet
  "Atatürk", "İnönü", "Bayar", "Menderes", "Gürsel", "Sunay", "Korutürk", "Evren", "Özal", "Demirel", "Sezer", "Gül", "Erdoğan",
  "Ecevit", "Erbakan", "Çiller", "Akbulut", "Davutoğlu", "Erim", "Ürgüplü", "Melen", "Talu", "Ulusu", "Saka", "Günaltay",
  "Peker", "Saracoğlu", "Saydam", "Okyar", "Karabekir", "Orbay", "Cebesoy", "Polatkan", "Zorlu", "Denktaş", "Tatar",
  // parti liderleri ve bakanlar
  "Kılıçdaroğlu", "Bahçeli", "Akşener", "Babacan", "Demirtaş", "İnce", "Özel", "Baykal", "Türkeş", "Yazıcıoğlu", "Destici", "Perinçek",
  "Kurtulmuş", "Karamollaoğlu", "Arınç", "Özdağ", "Oğan", "Karayalçın", "Cindoruk", "Ağar", "Öymen", "Kutan", "Asiltürk", "Buldan",
  "Sancar", "Hatimoğulları", "Bakırhan", "Yüksekdağ", "Türk", "Zana", "Önder", "Paylan", "Baş", "Okuyan", "Derviş", "Şener",
  "Soylu", "Çavuşoğlu", "Akar", "Albayrak", "Nebati", "Yerlikaya", "Bozdağ", "Varank", "Kacır", "Kasapoğlu", "Şentop", "Unakıtan",
  "Bağış", "Ala", "Elvan", "Özhaseki", "Ağbal", "Kalın", "Keçeciler", "Tüzmen", "Bayraktar", "Altaylı", "Kaftancıoğlu", "Türkkan",
  "Dervişoğlu", "Hamzaçebi", "Kavakçı", "Uzan", "Öcalan", "Gülen", "Oktar",
  // büyükşehir başkanları
  "İmamoğlu", "Yavaş", "Gökçek", "Topbaş", "Soyer", "Sarıgül", "Dalan", "Sözen", "Böcek", "Seçer", "Karalar", "Altepe",
  // tarih, fikir, basın
  "Gökalp", "Gezmiş", "Çayan", "Kaypakkaya", "Mumcu", "Dink", "Nesin", "Kanık", "Pamuk", "Şafak", "Dündar", "Birand", "Özkök", "Özdil",
  "Portakal", "Kırca", "Ilıcalı", "Bayülgen", "Anlı", "Sayan", "Tümer", "Erken", "Muhtar", "Ağca", "Çakıcı", "Bardakçı", "Kaşıkçı",
  // iş dünyası, bilim
  "Koç", "Sabancı", "Ülker", "Eczacıbaşı", "Doğan", "Şahenk", "Ağaoğlu", "Çalık", "Cengiz", "Sancak", "Arf", "Dağdeviren", "Gökçen",
  "Atadan", "Uşaklıgil",
  // müzik
  "Tatlıses", "Gencebay", "Gürses", "Müren", "Pekkan", "Manço", "Tevetoğlu", "Tayfur", "Ersoy", "Sayın", "Ertaş", "Erener", "Sandal",
  "Ortaç", "Doğulu", "Akalın", "Tilbe", "Gündeş", "Erçetin", "Akbayram", "Bağcan", "Kırmızıgül", "Ceceli", "Alanson", "Kızılok",
  "Evgin", "Besen", "Özbeğen", "Kekilli", "Öncel", "Alpman", "Ergen", "Koray",
  // sinema, dizi, sahne
  "Sunal", "Şoray", "Girik", "Arkın", "İnanır", "Avşar", "Ar", "Naşit", "Özkul", "Akçatepe", "Gruda", "Gökbakar", "Demirer", "Tatlıtuğ",
  "İmirzalıoğlu", "Bilginer", "Büyüküstün", "Ergenç", "Özçivit", "Uzerli", "Akbağ", "Alasya", "Uygur", "Şensoy", "Yeşilçay", "Evcen",
  "Öden", "Erçel", "Akyürek", "Kentmen", "Poyrazoğlu", "Kenter", "Soygazi", "Hun", "Tibet", "Kaynarca", "Gezen", "Salman", "Kutman",
  "Aslantuğ", "Koçyiğit", "Günaydın",
  // spor
  "Terim", "Şükür", "Reçber", "Süleymanoğlu", "Altıntop", "Kahveci", "Belözoğlu", "Kerimoğlu", "Özalan", "Şaş", "Davala", "Dilmen",
  "Özil", "Çalhanoğlu", "Gündoğan", "Demiral", "Ataman", "Buruk", "Yanal", "Kayaalp", "Aktürkoğlu", "Türkoğlu", "Şentürk",
];

// Soyadı sıradan ama tam adı tanınmış kişiler: bu birleşimler hiç üretilmez
const YASAK_TAM = [
  // siyaset
  "Mesut Yılmaz", "Cevdet Yılmaz", "Binali Yıldırım", "Aziz Yıldırım", "Hikmet Çetin", "Ömer Çelik", "Hüseyin Çelik", "Faruk Çelik",
  "Mehmet Şimşek", "Hakan Fidan", "Yılmaz Tunç", "Fahrettin Koca", "Ziya Selçuk", "Mahmut Özer", "Yusuf Tekin", "Fuat Oktay",
  "Veysel Eroğlu", "Derviş Eroğlu", "Taner Yıldız", "Nabi Avcı", "Ömer Dinçer", "Beşir Atalay", "Cemil Çiçek", "Zafer Çağlayan",
  "Nihat Ergün", "Sadullah Ergin", "Ertuğrul Günay", "İsmail Kahraman", "İbrahim Kalın", "Mahir Ünal", "Aziz Kocaoğlu", "Tanju Özcan",
  "Engin Altay", "Gültekin Uysal", "Ahmet Arslan", "Hilmi Güler", "İsmet Sezgin", "Sadi Irmak", "Fevzi Çakmak", "Burhan Kuzu",
  "Ali Erbaş", "Merve Kavakçı", "Nurettin Sözen", "Afet İnan", "Sabiha Gökçen", "Fahrettin Altun", "Ali Şahin", "Mehmet Aydın",
  // basın, iş dünyası
  "Aydın Doğan", "Cüneyt Özdemir", "Nihat Özdemir", "Uğur Dündar", "Orhan Pamuk", "Elif Şafak", "Mehmet Cengiz", "Attila İlhan",
  // müzik
  "Sezen Aksu", "Ahmet Kaya", "Cem Karaca", "Işın Karaca", "Levent Yüksel", "Hande Yener", "Sibel Can", "Zerrin Özer", "Ebru Yaşar",
  "Ebru Şahin", "Selami Şahin", "Hakkı Bulut", "Cengiz Kurtoğlu", "Emre Aydın", "Özcan Deniz", "Murat Boz", "Hüseyin Turan", "Cem Özer",
  // sinema, dizi, ekran
  "Cem Yılmaz", "Şener Şen", "Tarık Akan", "Filiz Akın", "Yılmaz Güney", "Metin Akpınar", "Uğur Yücel", "Tolga Çevik", "Engin Günaydın",
  "Erol Günaydın", "Hazal Kaya", "Demet Özdemir", "Tuba Ünsal", "Esra Erol", "Rasim Öztekin", "Kenan Işık", "Ercan Yazgan",
  "Hülya Koçyiğit", "Yılmaz Erdoğan", "Halit Akçatepe",
  // spor
  "Arda Turan", "Arda Güler", "Bülent Korkmaz", "Tanju Çolak", "Metin Oktay", "Şenol Güneş", "Aykut Kocaman", "Abdullah Avcı",
  "Oğuz Çetin", "Servet Çetin", "Selçuk İnan", "Mehmet Topal", "Mehmet Okur", "Halil Mutlu", "Taha Akgül", "Eda Erdem", "Zehra Güneş",
  "Cenk Tosun", "Zeki Çelik", "Yusuf Yazıcı", "Enes Ünal", "Ferdi Kadıoğlu", "Salih Özcan", "Kenan Yıldız", "Burak Yılmaz",
  "Rıdvan Yılmaz", "Hakan Ünsal", "Oğuz Aydın", "Süreyya Ayhan", "Hatice Akbaş",
];

// Tek bir siyasetçiyle özdeşleşmiş adlar ve seçimde rakip çıkan oyun kişilerinin adları (seçim gecesi karışmasın)
const YASAK_AD = [
  "Tayyip", "Devlet", "Binali", "Tansu", "Meral", "Necmettin", "Alparslan", "Selahattin", "Muharrem", "Ekrem", "Mansur", "Numan",
  "Berat", "Muhsin", "Hulusi", "Mevlüt", "Egemen", "Turgut", "Enver", "Talat", "Mithat", "Doğu", "Fahrettin", "Recep", "Recai",
  "Hüsamettin", "Ajda", "Tarkan", "Müslüm", "Hadise", "Kibariye", "Sertab", "Acun", "Serenay",
  "Nermin", "Suat", "Cengiz", "Kaan", "Bekir", "Rıza", "Tuncay", "Burak", "Nuri", "Fikret",
];

// cins: "k" | "e" · rng: 0-1 arası sayı veren işlev · son: daha önce atılan adlar (en yenisi sonda)
// Art arda aynı ad gelmez; son 8 atıştaki adlar ve soyadlar da mümkünse tekrar etmez. Ad + soyad isim kutusuna (24) sığar.
const rastgeleAd = (() => {
  const kucuk = s => s.toLocaleLowerCase("tr");
  const tam = new Set(YASAK_TAM.map(kucuk)), soy = new Set(YASAK_SOYAD.map(kucuk)), yad = new Set(YASAK_AD.map(kucuk));
  const havuz = { k: ADLAR.k.filter(a => !yad.has(kucuk(a))), e: ADLAR.e.filter(a => !yad.has(kucuk(a))) };
  const soyadlar = SOYADLAR.filter(s => !soy.has(kucuk(s)));
  const uygun = (a, s, onceki) => a !== s && a.length + s.length < 24 && !tam.has(kucuk(a + " " + s)) && a + " " + s !== onceki;
  return (cins, rng = Math.random, son = []) => {
    const adlar = havuz[cins === "e" ? "e" : "k"], onceki = son[son.length - 1];
    const yakin = new Set(son.slice(-8).flatMap(t => String(t).split(" ")));
    const sec = l => l[Math.min(l.length - 1, Math.floor(rng() * l.length))];
    for (let i = 0; i < 60; i++) {
      const a = sec(adlar), s = sec(soyadlar);
      if (!yakin.has(a) && !yakin.has(s) && uygun(a, s, onceki)) return a + " " + s;
    }
    // zar hep aynı yüze düşüyorsa (bozuk rng): sıradaki ilk uygun ad
    for (const a of adlar) for (const s of soyadlar) if (uygun(a, s, onceki)) return a + " " + s;
  };
})();
