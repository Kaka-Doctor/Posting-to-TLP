#!/usr/bin/env python3
"""Build data/posts.json for the Biblia-Tafsiri-Mbalimbali repo:
pairs each YouVersion VOTD image with its Swahili SUV caption."""
import json, os

P = "/home/z/my-project/biblia-repo/data/posts.json"

def cap(ref, text, body, tags):
    return f"{ref} (SUV)\n\n\"{text}\"\n\n{body}\n\n{tags}"

posts = [
    {
        "id": "votd-2026-09-15", "photo": "votd-2026-09-15.jpg",
        "source": "YouVersion Verse of the Day, 15 Sep 2026",
        "reference": "Maombolezo 3:22",
        "caption": cap("Maombolezo 3:22",
            "Fadhili za BWANA hazijapotea, maana rehema zake hazina mwisho.",
            "Kila siku mpya ni ushuhuda wa fadhili mpya za Mungu; hazijawahi koma japo safari yako igumu. "
            "Utulie moyoni leo, kwa maana rehema zake zinakufikia asubuhi hii pia.",
            "#Maombolezo #FadhiliZaMungu #Rehema #Matumaini #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-16", "photo": "votd-2026-09-16.jpg",
        "source": "YouVersion Verse of the Day, 16 Sep 2026",
        "reference": "Isaya 41:13",
        "caption": cap("Isaya 41:13",
            "Kwa maana mimi BWANA, Mungu wako, nashika mkono wako wa kuambia: Usiogopa, mimi nikusaidia.",
            "Mungu mwenyewe anashika mkono wako; hii si ahadi ya mbali, bali ya karibu na ya kila siku. "
            "Ukiogopa au kuwa na wasiwasi, kumbuka kwamba Yeye aliyekuumba yu pembeni yako kukusaidia.",
            "#Isaya #Usiogope #MunguWako #Imani #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-17", "photo": "votd-2026-09-17.jpg",
        "source": "YouVersion Verse of the Day, 17 Sep 2026",
        "reference": "Warumi 8:6",
        "caption": cap("Warumi 8:6",
            "Maana mawazo ya mwili ni mauti, bali mawazo ya Roho ni uzima na amani.",
            "Mawazo tunayoyaruhusu kuongoza moyo wetu huamua amani tunayoipata; mawazo ya Roho hutuletea uzima na utulivu wa ndani. "
            "Chagua leo kulishughulikia moyo wako kwa Neno la Mungu, na amani yake itakufunika.",
            "#Warumi #RohoMtakatifu #Amani #Mawazo #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-18", "photo": "votd-2026-09-18.jpg",
        "source": "YouVersion Verse of the Day, 18 Sep 2026",
        "reference": "Mithali 3:7",
        "caption": cap("Mithali 3:7",
            "Usiwe na hekima machoni pako mwenyewe; umwogope BWANA, ukengeue uovu.",
            "Hekima ya kweli huanza kwa kumwogopa Mungu, si kwa kujivunia ufahamu wetu wenyewe. "
            "Unapoinama mbele yake, Yeye anakuongoza katika njia safi, na baraka zake zinakufuatia.",
            "#Mithali #Hekima #KumwogopaMungu #Maisha #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-19", "photo": "votd-2026-09-19.jpg",
        "source": "YouVersion Verse of the Day, 19 Sep 2026",
        "reference": "Wafilipi 1:3",
        "caption": cap("Wafilipi 1:3",
            "Namshukuru Mungu wangu kila nikikumbuka ninyi.",
            "Shukrani ni dalili ya moyo unaotambua wema wa Mungu na wa watu waliotuzunguka. "
            "Mfanye shukrani kuwa tabia ya kila siku, nakuona neema nyingi zaidi za kushukuru.",
            "#Wafilipi #Shukrani #MoyoWaShukrani #Neema #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-20", "photo": "votd-2026-09-20.jpg",
        "source": "YouVersion Verse of the Day, 20 Sep 2026",
        "reference": "Zaburi 9:1",
        "caption": cap("Zaburi 9:1",
            "Nitamtukuza BWANA kwa moyo wangu wote; nitasimulia ajabu zake zote.",
            "Kumtukuza Mungu kwa moyo wote kunatoka kwa kumbukumbu ya yale aliyotenda kwetu. "
            "Kumbuka ajabu zake za mwisho na kumwonyesha shukrani yako kwa nguvu zote; Yeye anastahili sifa kila siku.",
            "#Zaburi #KumtukuzaBwana #Sifa #Shukrani #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-21-a", "photo": "votd-2026-09-21-a.jpg",
        "source": "YouVersion Verse of the Day, 21 Sep 2026 (design A)",
        "reference": "Kumbakumbu la Torati 7:9",
        "caption": cap("Kumbakumbu la Torati 7:9",
            "Utajua ya kuwa BWANA, Mungu wako, ndiye Mungu aliyeaminifu, anayeshika agano lake na rehema kwa wampendao na wazishikao amri zake, hata kwa elfu ya vizazi.",
            "Mungu wetu si Mungu wa jana tu; Yeye ni Mwamini wa agano kwa vizazi elfu. "
            "Ahadi zake hazishiki hewani, bali zinashikwa kwa usahihi wa milele; weka imani yako juu yake.",
            "#KumbakumbuLaTorati #MunguMwaminifu #Agano #Ahadi #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-21-b", "photo": "votd-2026-09-21-b.jpg",
        "source": "YouVersion Verse of the Day, 21 Sep 2026 (design B)",
        "reference": "Kumbakumbu la Torati 7:9",
        "caption": cap("Kumbakumbu la Torati 7:9",
            "Utajua ya kuwa BWANA, Mungu wako, ndiye Mungu aliyeaminifu, anayeshika agano lake na rehema kwa wampendao na wazishikao amri zake, hata kwa elfu ya vizazi.",
            "Amani ya moyo inapatikana tunapomwamini Mungu ambaye halali ahadi zake hata kwa maelfu ya vizazi. "
            "Ahadi yake ni imara kuliko mazingira yako; jizoeshe kuzikumbuka kila asubuhi.",
            "#MunguMwaminifu #RehemaZaMungu #Agano #Imani #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-21-c", "photo": "votd-2026-09-21-c.jpg",
        "source": "YouVersion Verse of the Day, 21 Sep 2026 (design C)",
        "reference": "Kumbakumbu la Torati 7:9",
        "caption": cap("Kumbakumbu la Torati 7:9",
            "Utajua ya kuwa BWANA, Mungu wako, ndiye Mungu aliyeaminifu, anayeshika agano lake na rehema kwa wampendao na wazishikao amri zake, hata kwa elfu ya vizazi.",
            "Katika ulimwengu wa ahadi zinazovunjika, Mungu ndiye pekee aliyebaki mwaminifu milele. "
            "Weka matumaini yako kwake, maana hata vizazi vijavyo vitamshuhudia uaminifu wake huo huo.",
            "#Uaminifu #MunguWaAgano #Matumaini #NenoLaMungu #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-21-d", "photo": "votd-2026-09-21-d.jpg",
        "source": "YouVersion Verse of the Day, 21 Sep 2026 (design D)",
        "reference": "Kumbakumbu la Torati 7:9",
        "caption": cap("Kumbakumbu la Torati 7:9",
            "Utajua ya kuwa BWANA, Mungu wako, ndiye Mungu aliyeaminifu, anayeshika agano lake na rehema kwa wampendao na wazishikao amri zake, hata kwa elfu ya vizazi.",
            "Rehema za Mungu si za muda mfupi; zinavuka vizazi na zinamfikia kila anayempenda na kuzishika amri zake. "
            "Katika kila tsimu ya maisha, kumbuka: Mungu wako hafichi, anashika agano lake daima.",
            "#Rehema #UaminifuWaMungu #Agano #Baraka #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-21-e", "photo": "votd-2026-09-21-e.jpg",
        "source": "YouVersion Verse of the Day, 21 Sep 2026 (design E)",
        "reference": "Kumbakumbu la Torati 7:9",
        "caption": cap("Kumbakumbu la Torati 7:9",
            "Utajua ya kuwa BWANA, Mungu wako, ndiye Mungu aliyeaminifu, anayeshika agano lake na rehema kwa wampendao na wazishikao amri zake, hata kwa elfu ya vizazi.",
            "Uaminifu wa Mungu ni msingi imara unaoweza kujenga maisha yako yote juu yake. "
            "Muda unabadilika na watu wanaobadilika, lakini agano lake la rehema linabaki milele; tegemea hilo.",
            "#MsingiImara #Uaminifu #AganoLaMungu #Matumaini #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "votd-2026-09-21-f", "photo": "votd-2026-09-21-f.jpg",
        "source": "YouVersion Verse of the Day, 21 Sep 2026 (design F)",
        "reference": "Kumbakumbu la Torati 7:9",
        "caption": cap("Kumbakumbu la Torati 7:9",
            "Utajua ya kuwa BWANA, Mungu wako, ndiye Mungu aliyeaminifu, anayeshika agano lake na rehema kwa wampendao na wazishikao amri zake, hata kwa elfu ya vizazi.",
            "Familia zinazoimika ni zile zinazoijenga kwenye uaminifu wa Mungu, si kwenye mafanikio ya muda. "
            "Mfundishe kizazi chako kuamin, maana agano lake la rehema limeandaliwa hata kwa maelfu ya vizazi.",
            "#UaminifuWaMungu #Familia #Vizazi #Rehema #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "web-votd-03", "photo": "web-votd-03.jpg",
        "source": "YouVersion-style verse graphic (web), Jeremiah 29:11",
        "reference": "Yeremia 29:11",
        "caption": cap("Yeremia 29:11",
            "Kwa maana mimi najua mawazo niyonayo kuhusu ninyi, asema BWANA, mawazo ya amani, wala si ya uovu, ili kuwapa ninyi tumaini na mwisho mwema.",
            "Hata pale maisha yanapoonekana kama mateka, Mungu ana mawazo ya amani kuhusu wewe; sio ya uovu. "
            "Safari yako haiishi kwenye tsimu; mwisho wake u mikononi mwa Mungu mwaminifu.",
            "#Yeremia #MawazoYaAmani #Tumaini #MwishoMwema #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "web-votd-06", "photo": "web-votd-06.jpg",
        "source": "YouVersion-style verse graphic (web), James 1:2-4",
        "reference": "Yakobo 1:2-4",
        "caption": cap("Yakobo 1:2-4",
            "Ndugu zangu, ihesabuni furaha tupu mtakapoyapata majaribu mbalimbali; mkijua ya kwamba kujaribiwa kwa imani yenu hunifanya uvumilivu; na uvumilivu na uwe na kazi timilifu, ili muwe timilifu na kamili kabisa, hamsikose neno.",
            "Majaribu hayatumii kwa kutuondoa kwa maana; hubana imani yetu hadi inakuwa imara na yenye uvumilivu. "
            "Usikate tamaa; kila jaribu linalopita linakuweka hatua moja karibu na utimilifu wa utukufu wa Mungu.",
            "#Yakobo #Majaribu #Uvumilivu #Imani #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "web-votd-07", "photo": "web-votd-07.jpg",
        "source": "YouVersion-style verse graphic (web), 2 Corinthians 5:7",
        "reference": "2 Wakorintho 5:7",
        "caption": cap("2 Wakorintho 5:7",
            "Kwa maana tunaenda kwa imani, wala si kwa kuona.",
            "Kuwa mwokozi kunatutuma kwenda njia isiyooonekana machoni; imani huamini kabla ya kuona. "
            "Endelea kutembea kwa imani hata kabla ya majibu kuonekana; hatua zako za imani hazitaachwa bila thawabu.",
            "#Wakorintho #Imani #KutembeaKwaImani #NenoLaMungu #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "web-votd-08", "photo": "web-votd-08.jpg",
        "source": "YouVersion-style verse graphic (web), 1 Peter 4:8",
        "reference": "1 Petro 4:8",
        "caption": cap("1 Petro 4:8",
            "Na juu ya vitu vyote, iweni na upendo wa dhati kati yenu; kwa maana upendo hufunika wingi wa dhambi.",
            "Upendo wa dhati si hisia tu, bali uamuzi wa kila siku wa kuwahurumia wengine kama Kristo alivyotufanyia sisi. "
            "Penye upendo wa kweli, makosa mengi yanafunikwa, na mahusiano yanapona.",
            "#Petro #Upendo #UpendoWaDhati #Msamaha #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "web-votd-09", "photo": "web-votd-09.jpg",
        "source": "YouVersion-style verse graphic (web), Matthew 5:3",
        "reference": "Mathayo 5:3",
        "caption": cap("Mathayo 5:3",
            "Heri mafukara wa roho, maana ufalme wa mbingu ni wao.",
            "Ufukara wa roho ni kutambua kila mara kwamba tunamtegemea Mungu kwa kila kitu. "
            "Mtie moyo wako wazi mbele yake, maana ufalme wake umeandaliwa kwa walio tayari kupokea.",
            "#Mathayo #HeriZaNane #UfalmeWaMbingu #Unyenyekevu #BibliaTafsiriMbalimbali"),
    },
    {
        "id": "web-votd-11", "photo": "web-votd-11.jpg",
        "source": "YouVersion-style verse graphic (web), Psalm 21:7",
        "reference": "Zaburi 21:7",
        "caption": cap("Zaburi 21:7",
            "Kwa maana mfalme anamtegemea BWANA, na kwa fadhili za Aliye Juu sana hatatatikisika.",
            "Wanaotegemea BWANA hawatatikisika, japo ngome za wafalme zitatikisika. "
            "Fadhili za Aliye Juu ndiyo nguzo imara kuliko ngome zote; jenga juu yake.",
            "#Zaburi #KumtegemeaBwana #FadhiliZaMungu #NguzoImara #BibliaTafsiriMbalimbali"),
    },
]

manifest = {
    "version": 1,
    "description": "Verse-of-the-Day pool: each entry pairs a YouVersion VOTD image with its Swahili SUV caption (scripture + two sentences + 5 hashtags). The agent rotates through these in order.",
    "generated": "2026-09-22",
    "translation": "SUV (Swahili Union Version)",
    "posts": posts,
}

with open(P, "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"posts.json written: {len(posts)} posts")
print(f"file size: {os.path.getsize(P)} bytes")
