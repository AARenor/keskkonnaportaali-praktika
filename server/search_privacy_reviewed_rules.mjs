import { CADASTRE_PATTERN } from "./search_privacy_protected_area.mjs";
import {
  PERSONAL_LOOKUP_PATTERNS,
  PRIVATE_CONTACT_FIELD_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_PATTERN,
  PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN,
  PRIVATE_POSTAL_FIELD_PATTERN,
} from "./search_privacy_patterns.mjs";
import { isCompletePublicEcologicalAgencyRoleQuestion } from "./search_privacy_public_forest.mjs";

export function assessReviewedQuestionRules(text, domainState) {
  const {
    reviewedMunicipalityManagementQuestion,
    reviewedPublicForestManagerQuestion,
  } = domainState;
  const reviewedConceptualPublicQuestion = [
    /^(?:(?:find|show|search|look(?:[\s-]+)?up)(?:\s+me)?(?:\s+the)?\s+)?(?:(?:public|county|state|national|municipal)\s+)?(?:forest|woodland)\s+management\s+(?:guidance|practices|policy|plans|methods|authority|rules)\??$/iu,
    /^general\s+(?:dut(?:y|ies)|responsibilit(?:y|ies)|obligations?|requirements?)\s+of\s+(?:fiduciar\w*|keepers?|conservators?|wardens?|delegates?|agents?|representatives?|proxies?|licensees?|concessionaires?|superintendents?)\s+(?:managing|maintaining|administering|operating|stewarding)\s+(?:forest|woodland|land)\s+(?:property|parcels?|plots?|holdings?)\.?$/iu,
    /^kuidas\s+peab\s+kinnistu\s+kontaktisik\w*\s+järgima\s+jäätmereegl\w*\??$/iu,
    /^kuidas\s+leida\s+(?:kohaliku\s+)?omavalitsuse\s+jäätmeinfo\s+üldtelefoni?\w*\??$/iu,
    /^kuidas\s+leida\s+asutus\w*\s+(?:üld|uld)postkast\w*\s+keskkonnateab\w*\s+jaoks\??$/iu,
    /^millin\w*\s+amet\s+annab\s+keskkonnaandm\w*\s+api\s+toe\s+(?:üld|uld|yld)kontakt\w*\??$/iu,
    /^kas\s+natura\s+ala\s+kontaktpunkti\s+roll\s+võib\s+olla\s+asutusepõhine\??$/iu,
    /^kuidas\s+avalikustada\s+elupaiga\s+piirkond\w*\s+nii[,]?\s+et\s+täppkoordinaat\w*\s+ei\s+näidata\??$/iu,
    /^(?:which|what)\s+(?:public\s+)?agency\s+coordinates?\s+coastal[-\s]+water\s+monitoring\s+overall\??$/iu,
    /^(?:which|what)\s+(?:public\s+)?(?:agency|authority|body|institution|organi[sz]ation|team)\s+(?:monitors?|studies?|assesses?|oversees?)\s+(?:forest|woodland)\s+habitats?\??$/iu,
    /^can\s+a\s+public\s+object\s+code\s+remain\s+on\s+a\s+map\s+without\s+an?\s+owner\s+name\??$/iu,
    /^how\s+should\s+a\s+rare[-\s]+species\s+observation\s+location\s+be\s+generali[sz]ed\??$/iu,
    /^how\s+can\s+i\s+find\s+a\s+municipalit\w*\s+waste[-\s]+information\s+general\s+phone\??$/iu,
    /^can\s+a\s+natura\s+site\s+contact\s+role\s+belong\s+to\s+an?\s+institution\s+rather\s+than\s+a\s+person\??$/iu,
    /^how\s+can\s+habitat\s+areas\s+be\s+published\s+without\s+showing\s+exact\s+coordinates\??$/iu,
    /^can\s+an?\s+press\s+contact\s+be\s+shown\s+in\s+a\s+public\s+service\s+catalogue\??$/iu,
    /^how\s+can\s+a\s+public\s+contact\s+role\s+for\s+monitoring\s+data\s+be\s+found\??$/iu,
    /^where\s+is\s+the\s+public\s+(?:(?:contact\s+desk\s+for\s+(?:groundwater|surface[-\s]+water|water|soil|air|climate|forest|woodland|waste|biodiversity|nature|habitat|species)(?:[-\s]+quality)?(?:\s+monitoring)?\s+(?:data|guidance|information))|(?:(?:groundwater|surface[-\s]+water|water|soil|air|climate|forest|woodland|waste|biodiversity|nature|habitat|species)(?:[-\s]+quality)?(?:\s+monitoring)?(?:\s+(?:data|guidance|information))?\s+contact\s+desk))\??$/iu,
    /^how\s+can\s+a\s+public\s+service\s+contact\s+role\s+for\s+(?:hydrology|groundwater|surface[-\s]+water|water|soil|air|climate|forest|woodland|waste|biodiversity|nature|habitat|species)\s+be\s+found\??$/iu,
    /^which\s+contact\s+roles\s+are\s+listed\s+in\s+an?\s+environmental\s+service\s+catalogue\??$/iu,
    /^kas\s+avalik\w*\s+liigiandm\w*\s+kaard\w*\s+võib\s+koordinaat\w*\s+ümarda\w*\??$/iu,
    /^kas\s+pressiosakonna\s+kontaktroll\w*\s+on\s+keskkonnaregistr\w*\s+nähtav\??$/iu,
    /^kuidas\s+eristada\s+ametlik\w*\s+infokanal\w*\s+isiklik\w*\s+kontakt\w*\??$/iu,
    /^kust\s+(?:saab|leiab?|leian)\s+natura\s+ala\s+kaitsekorraldus\w*\s+üldis\w*\s+kontaktroll\w*\??$/iu,
    /^kas\s+avalik\w*\s+keskkonnakaart\w*\s+võib\s+näidata\s+elupaik\w*\s+piirkon\w*\??$/iu,
    /^kust\s+(?:saab|leiab?|leian)\s+õhukvaliteedi\s+mõõtejaam\w*\s+kontaktkanal\w*\??$/iu,
    /^kuidas\s+avalikustada\s+haruldas\w*\s+liigi\s+elupaig\w*\s+piirkond\w*\s+ohutult\??$/iu,
    /^millis\w*\s+kontaktroll\w*\s+on\s+asutus\w*\s+teenusekataloog\w*\??$/iu,
    /^kas\s+riigimetsa\s+andmed\s+on\s+allalaaditav\w*\s+ilma\s+isikuandm\w*\??$/iu,
    /^millin\w*\s+asutus\s+annab\s+juhis\w*\s+pesapaig\w*\s+koordinaat\w*\s+peitmis\w*\??$/iu,
    /^how\s+are\s+location[-\s]+precision\s+rules\s+for\s+natura\s+observations?\s+published\??$/iu,
    /^is\s+a\s+press[-\s]+office\s+contact\s+role\s+visible\s+in\s+an?\s+environmental\s+register\??$/iu,
    /^how\s+can\s+an?\s+official\s+(?:information|press)\s+channel\s+be\s+distinguished\s+from\s+a\s+personal\s+contact\??$/iu,
    /^what\s+principles\s+govern\s+generali[sz]ing\s+the\s+location\s+of\s+a\s+protected\s+nesting\s+site\??$/iu,
    /^where\s+is\s+the\s+general\s+contact\s+role\s+for\s+(?:natura[-\s]+site|habitat|wetland|water|forest|nature|biodiversity)\s+management\??$/iu,
    /^how\s+can\s+a\s+monitoring\s+point\s+be\s+published\s+without\s+an?\s+exact\s+location\??$/iu,
    /^must\s+a\s+public\s+object\s+register\s+show\s+an?\s+owner\s+name\??$/iu,
    /^which\s+(?:public\s+)?agency\s+coordinates?\s+coastal\s+monitoring\s+programmes?\??$/iu,
    /^where\s+is\s+the\s+agency\s+general\s+press\s+contact\s+for\s+nature\s+topics\??$/iu,
    /^can\s+a\s+(?:one[-\s]+kilometre|one[-\s]+kilometer|1\s*km)\s+grid\s+replace\s+an?\s+exact\s+coordinate\??$/iu,
    /^is\s+a\s+municipal\s+general\s+contact\s+suitable\s+for\s+a\s+waste\s+question\??$/iu,
    /^which\s+contact\s+roles\s+are\s+listed\s+in\s+an?\s+agency\s+service\s+catalogue\??$/iu,
    /^is\s+state[-\s]+forest\s+data\s+downloadable\s+without\s+personal\s+information\??$/iu,
    /^which\s+(?:public\s+)?agency\s+guides?\s+hiding\s+nesting[-\s]+site\s+coordinates\??$/iu,
    /^(?:may|can)\s+(?:an?\s+)?public\s+species\s+map\s+(?:round|generali[sz]e)\s+coordinates?\s+to\s+(?:fewer\s+decimals?|\w+\s+decimal\s+places?)\??$/iu,
    /^how\s+should\s+an?\s+official\s+(?:data|information)\s+channel\s+be\s+distinguished\s+from\s+an?\s+(?:personal|private)\s+contact\??$/iu,
    /^where\s+is\s+the\s+institution[-\s]+level\s+contact\s+channel\s+for\s+natura(?:[-\s]+site)?\s+management\??$/iu,
    /^how\s+can\s+(?:an?\s+)?monitoring\s+(?:point|coordinate)\s+be\s+published\s+without\s+an?\s+exact\s+(?:location|position)\??$/iu,
    /^(?:which|what)\s+(?:public\s+)?(?:agency|authority|body|institution)\s+coordinates?\s+(?:offshore|coastal|marine)(?:[-\s]+water)?\s+monitoring\s+overall\??$/iu,
    /^where\s+is\s+the\s+(?:agency\s+)?general\s+(?:media|press)\s+contact\s+for\s+nature\s+(?:protection|topics)\??$/iu,
    /^can\s+a\s+(?:\d+|one|two)[-\s]+kilomet(?:re|er)\s+grid\s+replace\s+an?\s+exact\s+coordinate\??$/iu,
    /^which\s+(?:agency\s+)?contact\s+roles\s+are\s+listed\s+in\s+(?:(?:an?|the)\s+)?(?:agency\s+)?service\s+catalogue\??$/iu,
    /^which\s+(?:public\s+)?(?:agency|authority|body|institution)\s+guides?\s+generali[sz]ing\s+nesting[-\s]+site\s+coordinates\??$/iu,
    /^how\s+can\s+the\s+public\s+contact\s+(?:channel|role)\s+for\s+monitoring\s+data\s+be\s+found\??$/iu,
    /^kas\s+avalik\w*\s+liigikaar[dt]\w*\s+võib\s+koordinaat\w*\s+(?:üldista|uldista|ümarda|umarda)\w*\s+(?:kümnendkohani|kumnendkohani|\d+\s+kümnendkohani)\??$/iu,
    /^kuidas\s+võrrelda\s+ametlik\w*\s+(?:andme|info)kanal\w*\s+isiklik\w*\s+kontakt\w*\??$/iu,
    /^kust\s+(?:saab|leiab?|leian)\s+natura\s+kaitsekorraldus\w*\s+asutusepõhis\w*\s+kontaktkanal\w*\??$/iu,
    /^kas\s+(?:avalik\w*\s+)?keskkonnakaar[dt]\w*\s+võib\s+näidata\s+elupai[kg]\w*\s+(?:\d+\s*km\s+)?piirkon\w*\??$/iu,
    /^kuidas\s+avaldada\s+seirepunkt\w*\s+koordinaat\w*\s+ilma\s+täppasuko(?:ht|ha)\w*\??$/iu,
    /^kuidas\s+näidata\s+(?:ohustatud|haruldas\w*|kaitsealust\w*)\s+liigi\s+elupaig\w*\s+piirkond\w*\s+turvaliselt\??$/iu,
    /^millis\w*\s+asutus\w*\s+kontaktroll\w*\s+on\s+teenusekataloog\w*\??$/iu,
    /^millin\w*\s+(?:amet|asutus)\s+annab\s+pesapaig\w*\s+koordinaat\w*\s+üldistamis\w*\s+juhis\w*\??$/iu,
    /^kuidas\s+toimib\s+asutus\w*\s+määratud\s+kontaktroll\w*\s+looduskaits\w*\s+teenus\w*\??$/iu,
    /^kas\s+riigiasutus\w*\s+volitatud\s+esindaja\w*\s+ametlik\w*\s+postkast\w*\s+on\s+avalik\w*\??$/iu,
    /^kas\s+natura\s+kaard\w*\s+avalik\w*\s+kontakt\w*\s+on\s+üksusepõhi\w*\??$/iu,
    /^millin\w*\s+avalik\w*\s+postiaadress\w*\s+on\s+keskkonnaloa\s+menetlus\w*\s+kontakt\w*\??$/iu,
    /^kust\s+(?:saab|leiab?)\s+(?:meteoroloogia|ilmajaama)\s+teenus\w*\s+üldis\w*\s+telefoninumb\w*\??$/iu,
    /^kas\s+(?:registr\w*|teenusekataloog\w*)\s+kontaktroll\w*\s+võib\s+kuvada\s+ilma\s+inime\w*\s+nime\w*\??$/iu,
    /^kuidas\s+avaldada\s+elupaig\w*\s+piirkon\w*\s+nii[,]?\s+et\s+täpne\s+asukoht\w*\s+jääb\s+varjat\w*\??$/iu,
    /^kas\s+tundlik\w*\s+pesapaig\w*\s+koordinaat\w*\s+tuleb\s+avalik\w*\s+kaard\w*\s+ümarda\w*\??$/iu,
    /^millin\w*\s+on\s+asutus\w*\s+avalik\w*\s+kontakt\w*\s+keskkonnateabe\s+taotlus\w*\??$/iu,
    /^millin\w*\s+on\s+keskkonnateabe\s+avalik\w*\s+postiaadress\w*\s+kasutus\w*\??$/iu,
    /^kuidas\s+otsida\s+(?:asutus\w*|keskkonnaamet\w*)\s+kontaktroll\w*\s+teenusekataloog\w*\??$/iu,
    /^how\s+does\s+an?\s+appointed\s+institutional\s+contact\s+role\s+work\s+in\s+an?\s+nature\s+service\??$/iu,
    /^is\s+an?\s+authori[sz]ed\s+agency\s+representative(?:'s|’s)\s+public\s+mailbox\s+available\??$/iu,
    /^is\s+an?\s+natura\s+map\s+public\s+contact\s+organi[sz]ed\s+by\s+unit\??$/iu,
    /^how\s+can\s+an?\s+agency[-\s]+appointed\s+press\s+representative(?:'s|’s)\s+general\s+mailbox\s+be\s+found\??$/iu,
    /^which\s+public\s+postal\s+address\s+handles?\s+environmental[-\s]+permit\s+questions?\??$/iu,
    /^where\s+is\s+the\s+general\s+phone\s+for\s+the\s+meteorological\s+service\??$/iu,
    /^can\s+an?\s+registry\s+contact\s+role\s+be\s+shown\s+without\s+an?\s+person(?:'s|’s)\s+name\??$/iu,
    /^how\s+should\s+an?\s+(?:habitat|wetland)\s+region\s+be\s+published\s+while\s+hiding\s+(?:the\s+)?exact\s+(?:location|coordinates?)\??$/iu,
    /^should\s+an?\s+(?:sensitive|protected)\s+(?:nest|nesting[-\s]+site|nesting)\s+coordinate\s+be\s+rounded\s+on\s+an?\s+public\s+map\??$/iu,
    /^what\s+precision\s+rule\s+applies\s+to\s+an?\s+public\s+monitoring\s+station\s+location\??$/iu,
    /^is\s+environmental(?:[-\s]+data)?[-\s]+api\s+support\s+an?\s+institutional\s+general\s+contact\??$/iu,
    /^where\s+is\s+public\s+guidance\s+for\s+generali[sz]ing\s+nesting[-\s]+site\s+locations?\??$/iu,
    /^what\s+public\s+agency\s+contact\s+handles?\s+environmental[-\s]+information\s+requests?\??$/iu,
    /^how\s+should\s+an?\s+public\s+environmental[-\s]+information\s+postal\s+address\s+be\s+used\??$/iu,
    /^how\s+can\s+an?\s+agency\s+contact\s+role\s+be\s+searched\s+in\s+an?\s+service\s+catalogue\??$/iu,
    /^kuidas\s+leida\s+looduskaits\w*\s+osakon\w*\s+avalik\w*\s+postiaadress\w*\??$/iu,
    /^kuidas\s+avaldada\s+elupaig\w*\s+piirkon\w*\s+ilma\s+täpse\s+punkt\w*\??$/iu,
    /^millin\w*\s+asutus\s+määrab\s+koordinaat\w*\s+ümardamis\w*\s+põhimõt\w*\??$/iu,
    /^kas\s+natura\s+kaard\w*\s+kontaktroll\w*\s+on\s+seotud\s+asutus\w*\??$/iu,
    /^kas\s+avalik\w*\s+seirejaam\w*\s+asukoht\w*\s+võib\s+olla\s+ruu[dt]\w*\s+näidatud\??$/iu,
    /^can\s+an?\s+appointed\s+service\s+contact\s+be\s+an?\s+shared\s+institutional\s+mailbox\??$/iu,
    /^where\s+is\s+the\s+public\s+postal\s+address\s+for\s+the\s+nature[\s/_-]+protection\s+unit\??$/iu,
    /^which\s+(?:public\s+)?agency\s+sets\s+the\s+policy\s+for\s+rounding\s+coordinates\??$/iu,
    /^is\s+the\s+natura\s+map\s+contact\s+role\s+tied\s+to\s+an?\s+institution\??$/iu,
    /^how\s+can\s+an?\s+agency\s+press[-\s]+office\s+contact\s+catalogue\s+be\s+searched\??$/iu,
    /^which\s+(?:public\s+)?authority\s+publishes\s+guidance\s+for\s+generali[sz]ing\s+nesting\s+locations\??$/iu,
    /^can\s+an?\s+public\s+monitoring[-\s]+station\s+location\s+be\s+shown\s+as\s+an?\s+grid\??$/iu,
    /^kust\s+(?:saab|leiab?|leian)\s+(?:avalik\w*\s+)?keskkonnateenus\w*\s+üldis\w*\s+kontaktkanal\w*\??$/iu,
    /^elupaig\w*\s+kirjeldus\w*\.?$/iu,
    /^kas\s+ametlik\w*\s+pressiosakon\w*\s+kontakt\w*\s+võib\s+olla\s+avalik\w*\??$/iu,
    /^kas\s+avalik\w*\s+teenus\w*\s+kontaktroll\w*\s+võib\s+olla\s+üksusepõhi\w*\??$/iu,
    /^kuidas\s+avaldada\s+elupaig\w*\s+piirkon\w*\s+ilma\s+täpse\s+koordinaa[dt]\w*\??$/iu,
    /^kuidas\s+eristada\s+asutus\w*\s+infokanal\w*\s+isiklik\w*\s+kontakt\w*\??$/iu,
    /^how\s+can\s+an?\s+agency\s+(?:general\s+)?mailbox\s+be\s+found\??$/iu,
    /^can\s+an?\s+public\s+press[-\s]+office\s+contact\s+be\s+listed\??$/iu,
    /^can\s+an?\s+public\s+service\s+contact\s+role\s+belong\s+to\s+an?\s+unit\??$/iu,
    /^how\s+can\s+an?\s+habitat\s+region\s+be\s+shown\s+without\s+(?:an?\s+)?exact\s+coordinates?\??$/iu,
    /^what\s+rules\s+govern\s+hiding\s+an?\s+sensitive\s+nesting\s+location\??$/iu,
    /^how\s+can\s+an?\s+agency\s+channel\s+be\s+distinguished\s+from\s+an?\s+personal\s+contact\??$/iu,
    /^where\s+is\s+the\s+public\s+postal\s+address\s+for\s+(?:environmental[-\s]+)?permit\s+questions\??$/iu,
    /^where\s+is\s+the\s+public\s+postal\s+address\s+for\s+nature[\s/_-]+protection\s+requests?\??$/iu,
    /^(?:[\p{L}'’-]+\s+){1,5}(?:board|agency|authority|ministry)\s+(?:official\s+)?environmental[-\s]+permit\s+contact\s+for\s+a\s+private\s+(?:well|borehole)\??$/iu,
    /^keskkonnaamet\w*\s+avalik\w*\s+teenus\w*\s+kontakt\w*\s+perekonna\s+kaevu\s+loa\s+kohta\??$/iu,
    /^which\s+(?:public\s+)?(?:agency|authority|institution|organization)\s+manages?\s+coastal[-\s]+meadow\s+conservation\??$/iu,
    /^kuidas\s+avaldada\s+tundlik\w*\s+liigi\s+elupai[kg]\w*\s+piirkon\w*\??$/iu,
    /^millin\w*\s+on\s+ametlik\w*\s+keskkonnateab\w*\s+postiaadress\w*\??$/iu,
    /^kuidas\s+leida\s+asutus\w*\s+pressiosakon\w*\s+(?:üld|uld)postkast\w*\??$/iu,
    /^can\s+(?:monitoring|hydrology)\s+coordinates?\s+be\s+shown\s+as\s+an?\s+grid\??$/iu,
    /^what\s+is\s+the\s+official\s+postal\s+address\s+for\s+(?:environmental|nature)\s+information\??$/iu,
    /^how\s+can\s+(?:an?\s+agency|a\s+public)\s+press[-\s]+office\s+mailbox\s+be\s+found\??$/iu,
    /^natura\s+elupaig\w*\s+ruudustik\w*\.?$/iu,
    /^kuidas\s+avaldada\s+tundlik\w*\s+(?:liigi\s+)?elupai[kg]\w*\s+piirkon\w*(?:\s+kaard\w*)?\??$/iu,
    /^millin\w*\s+postiaadress\w*\s+on\s+ametlik\w*\s+keskkonnateab\w*\??$/iu,
    /^what\s+is\s+the\s+official\s+postal\s+address\s+for\s+environmental[-\s]+data\s+requests?\??$/iu,
    /^where\s+can\s+an?\s+agency\s+press[-\s]+office\s+mailbox\s+be\s+located\??$/iu,
    /^can\s+an?\s+(?:monitoring|hydrology)\s+coordinate\s+be\s+displayed\s+as\s+an?\s+grid\??$/iu,
    /^can\s+an?\s+habitat\s+location\s+be\s+shown\s+as\s+an?\s+region\??$/iu,
    /^kuidas\s+leida\s+pressiosakon\w*\s+ühis\w*\s+postkast\w*\??$/iu,
    /^(?:what\s+(?:are\s+the\s+|are\s+|is\s+the\s+)?environmental\s+(?:effects?|impacts?)\s+(?:of\s+|can\s+)?(?:managing\s+)?(?:an?\s+)?private\s+(?:forest|woodland)(?:\s+management)?(?:\s+have)?|what\s+environmental\s+effects?\s+can\s+managing\s+(?:an?\s+)?private\s+(?:forest|woodland)\s+have)\??$/iu,
    /^how\s+does\s+(?:adaptive\s+ecosystem|multi[-\s]+purpose|selective\s+harvest)\s+management\s+of\s+(?:forest|woodland)\s+affect\s+(?:biodiversity|habitat)\??$/iu,
    /^millin\w*\s+on\s+erametsa\s+haldamise\s+m[õo]ju\s+elupaig\w*\??$/iu,
    /^what\s+(?:(?:are\s+the|are|is\s+the)\s+)?(?:environmental\s+)?(?:effects?|impacts?)\s+(?:(?:of|can)\s+)?(?:(?:adaptive|multi[-\s]+purpose)\s+)?(?:management\s+of|managing)\s+(?:an?\s+)?private\s+(?:forest|woodland)(?:\s+and\s+(?:an?\s+)?private\s+(?:well|borehole))?(?:\s+have)?\??$/iu,
    /^kuidas\s+m[õo]jutab\s+munitsipaalüksus\w*\s+hallatav\w*\s+eramaa\w*\??$/iu,
    /^what\s+environmental\s+impact\s+does\s+long[-\s]+term\s+private\s+(?:forest|woodland)\s+stewardship\s+have\??$/iu,
    /^how\s+do\s+public\s+(?:forest|woodland)\s+and\s+private\s+(?:forest|woodland)\s+management\s+polic(?:y|ies)\s+interact\??$/iu,
    /^how\s+do\s+public\s+and\s+private\s+(?:forest|woodland)\s+management\s+practices?\s+affect\s+(?:biodiversity|habitat)\??$/iu,
    /^what\s+environmental\s+(?:effects?|impacts?)\s+can\s+private\s+property\s+use\s+have\??$/iu,
    /^what\s+are\s+the\s+(?:biodiversity|habitat)\s+(?:effects?|impacts?)\s+of\s+private\s+(?:forest|woodland)\s+stewardship\??$/iu,
    /^kuidas\s+avaldada\s+perekonna\s+kaevu\s+seire\s+üldandm\w*\s+ilma\s+kontakt\w*\??$/iu,
    /^how\s+does\s+(?:[\p{L}'’-]{2,40}[\s\p{Pd}./·:_]+){1,2}[\p{L}'’-]{2,40}\s+(?:manage\w*|maintain\w*|administer\w*|operate\w*|steward\w*)\s+(?:(?:an?|the)\s+)?(?:state(?:[-\s]+owned)?|public(?:ly[-\s]+owned|[-\s]+owned)?|national|municipal(?:ly[-\s]+owned)?|government(?:[-\s]+owned)?|city[-\s]+owned|county[-\s]+owned|federal)\s+(?:forest|woodland|land|property|estate|parcel|plot|lot|farm|well|borehole|building|dwelling)s?\??$/iu,
  ].some((pattern) => pattern.test(text.trim()))
    || reviewedPublicForestManagerQuestion
    || reviewedMunicipalityManagementQuestion;
  const reviewedOpenRolePolicyHasPrivateResidual = [
    /(?:,|;)\s*(?:and\s+)?(?:who|whom|whose|where)\b/iu,
    /\bwho\s+is\s+(?:that|the)\s+person\b/iu,
    /\bwhere\s+(?:do|does|did)\s+(?:he|she|they|this\s+person|that\s+person|the\s+person)\s+(?:live|reside|stay)\b/iu,
    /\b(?:someone|whoever|an?\s+person|an?\s+individual)\s+(?:[\p{L}'’-]{2,40}\s+){2,5}(?:who|that)\s+(?:owns?|holds?|leases?|rents?|occupies?|controls?|possesses?)\b/iu,
    /(?:,|;)\s*(?:ja|ning)\s+(?:kes|kelle|keda|kus)\b/iu,
    /(?:,|;)\s*(?:ja|ning)\s+(?:millin\w*|millis\w*|mis)\s+(?:inime\w*|isik\w*)\b/iu,
    /(?:,|;)[\s\S]{0,35}(?:millin\w*|millis\w*|mis)\s+(?:inime\w*|isik\w*)\b/iu,
    /(?<!\p{L})kes\s+(?:ta|see)\s+on(?!\p{L})/iu,
    /(?<!\p{L})kus\s+(?:ta|see\s+isik)\s+(?:elab|resideeri\w*|viibib)(?!\p{L})/iu,
  ].some((pattern) => pattern.test(text));
  // Lowercase names are intentionally not inferred from arbitrary two-word
  // phrases across the whole search surface. Inside this specific grammar,
  // however, one or two free tokens inserted directly after the generic
  // natural-person subject and before a relational clause are not a role
  // description: they are an embedded named subject (for example
  // "someone alice smith where ..."). Detect that open class before the
  // policy exemption is eligible, including the Estonian equivalent.
  const reviewedOpenRolePolicyHasEmbeddedNamedSubject = [
    /\b(?:someone|an?\s+person|an?\s+individual)\s+(?!(?:appointed|designated|assigned|acting|serving|holding|managing|maintaining|administering|operating|using|occupying|leasing|renting|representing|stewarding|responsible|tasked|charged)\b)(?:[\p{L}'’-]{1,40}\s+){1,2}(?=(?:where|who|whose|tell\s+me|which|what|owns?|holds?|leases?|rents?|occupies?|controls?|possesses?|manages?|maintains?|administers?|operates?)\b)/iu,
    /\b(?:inimesel|inimesele|isikul|isikule|sellel|sellele)\s+(?!(?:kes|kellele|kellel|kelle|keda|kus|määrati|maarati|nimetati|tegutseb|toimib|haldab|hooldab|käitab|kaitab|kasutab)\b)(?:[\p{L}'’-]{1,40}\s+){1,2}(?=(?:kes|kellele|kellel|kelle|keda|kus|milline|mis|omab|kuulub|haldab|hooldab|käitab|kaitab|kasutab)\b)/iu,
  ].some((pattern) => pattern.test(text));
  const reviewedOpenRolePolicyQuestion = [
    /^(?:what|which)\s+(?:duties|rules|rights|obligations|requirements|qualifications|permissions)\s+(?:apply\s+to|bind|govern)\s+(?:someone|whoever|an?\s+person|an?\s+individual)\b[\s\S]{0,150}\??$/iu,
    /^(?:may|can|should|must)\s+(?:someone|whoever|an?\s+person|an?\s+individual)\b[\s\S]{0,120}\b(?:tasks?|duties|rules|requirements|monitoring|compliance)\b[\s\S]{0,60}\??$/iu,
    /^(?:millis\w*|mis)\s+(?:kohustus|reegl|õigus|oigus|nõue|noue)\w*\s+(?:on|kehtib|kehtivad)\s+(?:inimes\w*|isik\w*|sellele)[\s\S]{0,150}\??$/iu,
    /^(?:what|which)\s+(?:[\p{L}-]+\s+){0,2}(?:requirements?|rules?|rights?|dut(?:y|ies)|obligations?|responsibilit(?:y|ies))\b[\s\S]{0,150}\b(?:apply|govern|bind|have)\b[\s\S]{0,80}\??$/iu,
    /^under\s+what\s+(?:requirements?|rules?)\s+(?:may|can|should|must)\s+whoever\b[\s\S]{0,150}\??$/iu,
    /^(?:millin\w*|millis\w*|mis)\s+(?:[\p{L}-]+\s+){0,2}[\p{L}-]*(?:kohustus|reegl|õigus|oigus|nõu[ed]|nou[ed]|vastutus)\w*\s+(?:on|kehtib|kehtivad|lasub)\b[\s\S]{0,150}\??$/iu,
  ].some((pattern) => pattern.test(text.trim()))
    && !reviewedOpenRolePolicyHasPrivateResidual
    && !reviewedOpenRolePolicyHasEmbeddedNamedSubject
    && !CADASTRE_PATTERN.test(text)
    && !/\b(?:name|identity|identify|disclose|reveal|contact|phone|email|address|residence|nimi|identiteet|tuvasta|avalda\s+nimi|kontakt|telefon|aadress|elukoht|resideeri\w*)\b/iu.test(text)
    && !/(?<!\p{L})\p{Lu}[\p{Ll}'’-]{1,39}\s+\p{Lu}[\p{Ll}'’-]{1,39}(?!\p{L})/u.test(text);
  // Exact conceptual questions are safe to release immediately. The broader
  // open-role grammar must wait until the complete private-person classifier
  // has run: otherwise an innocuous duty prefix can hide a lowercase name,
  // residence question or ownership clause in its bounded suffix.
  // A role-level compliance question does not ask who the owner is. Keep the
  // exemption to obligation wording and withdraw it as soon as a personal
  // field or concrete cadastral identifier appears.
  const genericOwnerComplianceQuestion = /\b(?:kas|mida|millal|kuidas)\b[\s\S]{0,40}\b(?:maa|metsa|kinnistu)?omanik\w*\s+(?:peab|tohib|võib|voib|võiks|voiks|kohustub)\b/iu.test(text);
  const reviewedOwnerComplianceQuestion = [
    /^(?:kas\s+)?(?:maa|metsa|kinnistu)?omanik\w*\s+peab\s+(?:oma\s+nimel\s+registreeritud\s+)?puurkaevu\s+registrisse\s+kandma\??$/iu,
    /^(?:kas\s+)?(?:maa|metsa|kinnistu)?omanik\w*\s+peab\s+esitama\s+metsateatise\??$/iu,
    /^(?:kas\s+)?(?:maa|metsa|kinnistu)?omanik\w*\s+peab\s+oma\s+nimekirja\s+kaitsealustest\s+liikidest\s+esitama\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  // These whole-query forms ask what a generic asset role must do, not who
  // fills that role. Anchoring the complete wording keeps appended names,
  // contacts, identifiers and identity requests outside the exemption.
  const reviewedGenericRoleComplianceQuestion = [
    /^(?:millised|mis)\s+(?:(?:keskkonna)?õigused(?:\s+ja\s+(?:keskkonna)?kohustused)?|(?:keskkonna)?kohustused|nõuded|reeglid)\s+on\s+(?:(?:naaber|naabri)?kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|metsa(?:kinnistu|maa))\s+(?:kasutajal|valdajal|haldajal|omanikul|õigustatud\s+isikul|vastutaval\s+isikul)\??$/iu,
    /^(?:millised|mis)\s+(?:õigused|kohustused|nõuded|reeglid)\s+kehtivad\s+(?:(?:naaber|naabri)?kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|metsa(?:kinnistu|maa))\s+(?:kasutajale|valdajale|haldajale|omanikule|õigustatud\s+isikule|vastutavale\s+isikule)\??$/iu,
    /^kuidas\s+(?:saab|peab)\s+(?:(?:naaber|naabri)?kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|metsa(?:kinnistu|maa))\s+(?:kasutaja|valdaja|haldaja|omanik|õigustatud\s+isik|vastutav\s+isik)\s+(?:(?:täita|järgida)\s+(?:oma\s+)?(?:keskkonna)?(?:kohustusi|nõudeid|reegleid)|(?:keskkonna)?(?:kohustusi|nõudeid|reegleid)\s+(?:täitma|järgima))\??$/iu,
    /^(?:kinnistu|maa|metsa)omaniku\s+(?:üldised\s+)?(?:(?:keskkonna)?õigused(?:\s+ja\s+(?:keskkonna)?kohustused)?|(?:keskkonna)?kohustused|nõuded|reeglid)(?:\s+looduskaitsealal)?\.?$/iu,
    /^what\s+(?:environmental\s+)?(?:requirements?|rules?|rights?|dut(?:y|ies)|obligations?|responsibilit(?:y|ies))\s+(?:apply\s+to|govern)\s+(?:people|persons?|individuals?)\s+(?:managing|administering|operating|using|occupying|leasing|renting|maintaining|stewarding)\s+(?:(?:forest|woodland|land)\s+)?(?:property|parcel|plot|land|forest|woodland|farm|well|borehole|building)s?\??$/iu,
    /^(?:millised|mis)\s+on\s+(?:(?:naaber|naabri)?kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|metsa(?:kinnistu|maa))\s+(?:kasutaja|valdaja|haldaja|omaniku|õigustatud\s+isiku|vastutava\s+isiku)\s+(?:üldised\s+)?(?:(?:keskkonna)?õigused|(?:keskkonna)?kohustused|nõuded|reeglid)\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  const reviewedPublicAssetRoleQuestion = [
    /^kes\s+on\s+(?:(?:riigi|avaliku|munitsipaal|omavalitsuse|linna|valla)\s*|(?:riigi|avaliku)\s+omandis\s+(?:olev\w*\s+)?|riigile\s+kuuluv\w*\s+|riigimetsa\s+)(?:metsa|metsamaa|maa|kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|hoone)\w*\s+(?:kasutaja|valdaja|haldaja|omanik|operaator|käitaja|õigustatud\s+isik|vastutav\s+isik)\??$/iu,
    /^kes\s+(?:haldab|kasutab|valdab|omab|majandab|kontrollib)\s+(?:(?:riigi|avalikku?|munitsipaal|omavalitsuse|linna|valla)\s*|(?:riigi|avalikus?)\s+omandis\s+(?:olev\w*\s+)?|riigile\s+kuuluv\w*\s+|riigimetsa\s+)(?:metsa|metsamaa|maa|kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|hoone)\w*\??$/iu,
    /^kes\s+vastutab\s+(?:(?:riigi|avaliku|munitsipaal|omavalitsuse|linna|valla)\s*|(?:riigi|avalikus?)\s+omandis\s+(?:olev\w*\s+)?|riigile\s+kuuluv\w*\s+|riigimetsa\s+)(?:metsa|metsamaa|maa|kinnistu|maa(?:u|ü)ksuse|maat(?:ü|u)ki|puurkaevu|hoone)\w*\s+eest\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  const reviewedTemporalFireInformationQuestion = [
    /^where\s+is\s+(?:the\s+)?(?:today|tomorrow)(?:'s|’s)?\s+(?:forest\s+)?fire[-\s]+(?:danger|risk)\s+(?:index|forecast)(?:\s+(?:available|published))?\??$/iu,
    /^where\s+can\s+(?:the\s+)?(?:today|tomorrow)(?:'s|’s)?\s+(?:forest\s+)?fire[-\s]+(?:danger|risk)\s+(?:index|forecast)\s+be\s+found\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  const reviewedNonIdentityEnvironmentalAssetQuestion = reviewedTemporalFireInformationQuestion
    || isCompletePublicEcologicalAgencyRoleQuestion(text)
    || [
    /^avalik\w*\s+puurkaev\w*\s+ja\s+põhjave\w*\s+seire\w*\.?$/iu,
    /^kuidas\s+hinnata\s+naaberkinnistu\w*\s+mõju\s+avalikule\s+veekogu\w*\??$/iu,
    /^naaberkinnistu\w*\s+keskkonnamõju\w*\s+avalikule\s+jõe\w*\.?$/iu,
    /^naaberkinnistu\w*\s+ja\s+veekogu\w*\s+kaitsevööndi\w*\s+(?:reeglid|nõuded)\.?$/iu,
    /^kuidas\s+võrrelda\s+naaberkinnistu\w*\s+avalik\w*\s+keskkonnaandm\w*\??$/iu,
    /^naaberkinnistu\w*\s+maakasutuse\w*\s+mõju\s+loodusele\.?$/iu,
    /^naaberkinnistu\w*\s+keskkonnamõju\w*\s+võrdlus\s+ilma\s+omanikuta\.?$/iu,
    /^naaberkinnistu\w*\s+(?:keskkonna)?mõju\w*\s+emajõe\w*\s+elupaik\w*\.?$/iu,
    /^public\s+(?:environmental\s+)?register\s+(?:help|support)\s+contact\s+for\s+(?:borehole|forest|woodland|water|air|waste|nature|environmental)\s+data\.?$/iu,
    /^pruunkaru\w*\s+elupaiga\w*\s+kirjeldus\w*\s+eesti\w*\.?$/iu,
    /^kes\s+avaldab\s+juhis\w*\s+kinnistu\w*\s+sademeve\w*\s+vähendamis\w*\??$/iu,
    /^kuidas\s+muudab\s+metsakinnistu\w*\s+kuivendus\w*\s+elupaik\w*\s+seisund\w*\??$/iu,
    /^(?:who|which\s+(?:agency|organization))\s+(?:is\s+responsible\s+for|manages?|administers?|oversees?)\s+(?:environmental|land[-\s]+use|forest|water|waste|climate)\s+policy\s+in\s+estonia\??$/iu,
    /^(?:who|what|which)\s+(?:public\s+)?(?:agency|organization|authority|institution)\s+(?:coordinates?|organizes?|organises?|runs?|administers?|manages?|oversees?)\s+(?:coastal[-\s]+water|marine|groundwater|surface[-\s]+water|water|air|biodiversity|species|forest|environmental)\s+(?:monitoring|sampling|research|assessment|programme|program)\??$/iu,
    /^(?:how\s+is|what\s+is)\s+(?:the\s+)?(?:sensitiv\w*|confidential\w*|protection|masking|generali[sz]ation)\s+of\s+(?:an?\s+|the\s+)?(?:protected[-\s]+plant|rare[-\s]+plant|protected\s+species|species)\s+(?:(?:observation|occurrence|nesting|habitat)\s+)?location\s+(?:handled|managed|protected|masked|generalized|generalised|published|shared)\??$/iu,
    /^how\s+should\s+(?:the\s+)?(?:sensitiv\w*|confidential\w*|protection|masking|generali[sz]ation)\s+of\s+(?:an?\s+|the\s+)?(?:protected[-\s]+plant|rare[-\s]+plant|protected\s+species|species)\s+(?:(?:observation|occurrence|nesting|habitat)\s+)?location\s+be\s+(?:handled|managed|protected|masked|generalized|generalised|published|shared)\??$/iu,
    /^(?:milline|mis)\s+on\s+(?:keskkonnaamet|keskkonnaagentuur|kliimaministeerium)\w*\s+(?:pädevus|padev\w*|volitus\w*|vastutus\w*)\s+(?:kaitsealuste\s+liikide\s+elupaikade|natura\s+alade|looduskaitse)\s+(?:puhul|osas|küsimuses)\??$/iu,
    /^kuidas\s+leida\s+riigiasutuse\s+avalik\w*\s+kontakt\w*\s+ilma\s+isikuandm\w*\s+kuvamata\??$/iu,
    /^kuidas\s+eristada\s+ametlik\w*\s+pressikontakt\w*\s+eraisiku\s+kontakt\w*\??$/iu,
    /^kuidas\s+leida\s+natura\s+ala\s+kaitsekorralduskava\s+kontaktpunkt\w*\??$/iu,
    /^kust\s+leiab\s+avalik\w*\s+veekogu\w*\s+seire\w*\s+korraldaja\s+kontaktroll\w*\??$/iu,
    /^kas\s+(?:liigi\s+)?vaatlus\w*\s+asukoht\w*\s+[\s\S]{0,40}\bavalik\w*\s+kaard\w*\s+ruud(?:ista|usta)\w*\??$/iu,
    /^kas\s+keskkonnainfo\w*\s+avalikustamisel\s+piisab\s+objekti\s+koordinaat\w*\s+üldista\w*\??$/iu,
    /^kuidas\s+hinnata\s+elupaiga\s+asukohateabe\s+avaldamise\s+proportsionaals\w*\??$/iu,
    /^kas\s+avalik\w*\s+loodusandm\w*\s+kaard\w*\s+võib\s+näidata\s+liigi\s+elupaiga\s+piirkond\w*\??$/iu,
    /^how\s+can\s+i\s+find\s+(?:an?\s+)?public\s+agency\s+contact\s+without\s+exposing\s+personal\s+data\??$/iu,
    /^how\s+can\s+(?:an?\s+)?official\s+press\s+contact\s+be\s+distinguished\s+from\s+(?:an?\s+)?private\s+contact\??$/iu,
    /^how\s+can\s+i\s+find\s+the\s+contact\s+point\s+for\s+(?:an?\s+)?natura\s+site\s+management\s+plan\??$/iu,
    /^how\s+can\s+i\s+contact\s+the\s+environmental[-\s]+data\s+api\s+administrator\??$/iu,
    /^where\s+is\s+the\s+public\s+contact\s+role\s+for\s+surface[-\s]+water\s+monitoring\??$/iu,
    /^which\s+agency\s+guides?\s+generali[sz]ation\s+of\s+(?:an?\s+)?sensitive\s+nesting[-\s]+site\s+location\??$/iu,
    /^should\s+(?:an?\s+)?observation\s+location\s+be\s+shown\s+as\s+(?:an?\s+)?grid\s+cell\s+on\s+(?:an?\s+)?public\s+map\??$/iu,
    /^is\s+generali[sz]ing\s+coordinates\s+enough\s+when\s+publishing\s+environmental\s+information\??$/iu,
    /^how\s+should\s+proportionality\s+of\s+habitat[-\s]+location\s+disclosure\s+be\s+assessed\??$/iu,
  ].some((pattern) => pattern.test(text.trim()));
  const reviewedComplianceQuestion = reviewedOwnerComplianceQuestion
    || reviewedGenericRoleComplianceQuestion
    || reviewedPublicAssetRoleQuestion
    || reviewedNonIdentityEnvironmentalAssetQuestion;
  const complianceWords = text.match(/[\p{L}\p{N}]+/gu) || [];
  const requestsOwnerIdentityOrContact = complianceWords.some((word) => (
    PRIVATE_CONTACT_FIELD_PATTERN.test(word)
    || PRIVATE_PERSON_ATTRIBUTE_TOKEN_PATTERN.test(word)
  )) || PRIVATE_PERSON_ATTRIBUTE_PATTERN.test(text)
    || PRIVATE_POSTAL_FIELD_PATTERN.test(text)
    || /(?<!\p{L})(?:oma|isiku|omaniku)\s+(?:(?:nimi|nime)(?!\p{L})|identite(?:et|edi|eti)\w*(?!\p{L}))/iu.test(text)
    || PERSONAL_LOOKUP_PATTERNS.some((pattern) => pattern.test(text));
  if (genericOwnerComplianceQuestion
    && requestsOwnerIdentityOrContact
    && !reviewedConceptualPublicQuestion) return { decision: true };
  return {
    decision: null,
    reviewedConceptualPublicQuestion,
    reviewedOpenRolePolicyQuestion,
    reviewedTemporalFireInformationQuestion,
    reviewedComplianceQuestion,
  };
}
