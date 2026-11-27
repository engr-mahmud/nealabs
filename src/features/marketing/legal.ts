import { brand } from "@/config/brand";
import { billingConfig } from "@/config/plans";
import { softwareSeller } from "@/config/seller";

/**
 * Terms, Privacy Policy and Refund Policy, in English and Arabic.
 * DRAFT: written as a sensible starting point, not legal advice. Have a qualified lawyer
 * in Saudi Arabia review both languages (PDPL, e-commerce and consumer rules) before
 * launch, then set LEGAL_REVIEWED to true to remove the draft notice.
 */
export const LEGAL_REVIEWED = false;
export const LEGAL_UPDATED = new Date("2026-11-27T00:00:00Z");

export type LegalKind = "terms" | "privacy" | "refund";
type Lang = "en" | "ar";

export interface LegalDoc {
  title: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}

const P = brand.productName;
const SELLER_EN = softwareSeller.legalNameEn;
const SELLER_AR = softwareSeller.legalNameAr;
const EMAIL = brand.supportEmail;
const LOCATION = brand.dataLocation;
const REMIND = billingConfig.reminderDays.join(" and ");

const DOCS: Record<LegalKind, Record<Lang, LegalDoc>> = {
  terms: {
    en: {
      title: "Terms and Conditions",
      intro: `These terms apply when you use ${P}, provided by ${SELLER_EN} ("we"). By creating an account or paying for a plan, you agree to them on behalf of yourself and your company.`,
      sections: [
        { heading: "1. The service", body: [`${P} is online software for invoices, workforce records, salary sheets and simple finance. We may improve or change features over time. We will tell you in advance about changes that reduce what your plan includes.`] },
        {
          heading: "2. Your account",
          body: [
            "You must give correct details, including a mobile number you own. Keep your password secret. You are responsible for what happens under your account and for the people you invite to your company.",
            "Owners manage the company, team and billing. Accountants work with business data. Invite only people who need access.",
          ],
        },
        { heading: "3. Free trial", body: ["Each new account with a new email address and mobile number gets one 7-day free trial with all features. No card is needed. Creating extra accounts to get more free trials is not allowed."] },
        {
          heading: "4. Plans, prices and payment",
          body: [
            "Plans and prices are shown on the pricing page in Saudi riyals. Prices exclude VAT, which is added at the rate in force. Plans are paid in advance for one month, three months or twelve months. The yearly plan costs ten times the monthly price.",
            `There are no automatic charges. Before your plan ends we email the owner ${REMIND} days in advance, and you renew by paying on the billing page. A change of plan or billing cycle starts at the next renewal.`,
            "Payments are processed by our payment provider. We do not receive or store your full card number. A tax invoice is issued to your company for every payment.",
          ],
        },
        {
          heading: "5. When a trial or plan ends",
          body: [
            "If a trial ends, or a paid plan is not renewed within 3 days of its end, your company becomes read-only: you can view and export your data but not change it. We do not delete your data because a plan ended. Paying for a plan restores full access.",
          ],
        },
        {
          heading: "6. Your data",
          body: [
            "Your company's data belongs to your company. You are responsible for having the right to enter your workers' and clients' personal data and for its accuracy. We process it only to provide the service, as described in the Privacy Policy.",
            "You can export your data at any time. If you ask us to close your company account, we delete its data after a period we confirm with you, except where the law requires us to keep records (for example tax invoices we issued to you).",
          ],
        },
        {
          heading: "7. Acceptable use",
          body: ["Do not use the service for anything unlawful, to send misleading invoices, to access other companies' data, or to disrupt or test the security of the service without our written permission."],
        },
        {
          heading: "8. Tax and compliance",
          body: [
            "The software helps you prepare tax invoices with the information and QR code required for the current e-invoicing phase we support. You remain responsible for your own tax filings and for checking which e-invoicing requirements apply to your business.",
          ],
        },
        {
          heading: "9. Availability and liability",
          body: [
            "We work to keep the service available and your data backed up, but we cannot promise it will never be interrupted. To the extent the law allows, our total liability for any claim is limited to the amount you paid us in the 12 months before the claim, and we are not liable for indirect losses such as lost profit.",
          ],
        },
        { heading: "10. Changes to these terms", body: ["We may update these terms. We will notify owners by email at least 14 days before important changes take effect."] },
        { heading: "11. Law", body: ["These terms are governed by the laws of the Kingdom of Saudi Arabia. The Arabic version prevails if the two versions differ."] },
        { heading: "12. Contact", body: [`Questions about these terms: ${EMAIL}.`] },
      ],
    },
    ar: {
      title: "الشروط والأحكام",
      intro: `تنطبق هذه الشروط عند استخدامك ${P} المقدّم من ${SELLER_AR} ("نحن"). بإنشاء حساب أو دفع قيمة باقة، فإنك توافق عليها عن نفسك وعن شركتك.`,
      sections: [
        { heading: "1. الخدمة", body: [`${P} برنامج عبر الإنترنت للفواتير وسجلات العمال ومسيرات الرواتب والمالية البسيطة. قد نطوّر المزايا أو نغيّرها مع الوقت، وسنبلغك مسبقاً بأي تغيير يقلّل مما تشمله باقتك.`] },
        {
          heading: "2. حسابك",
          body: [
            "يجب أن تقدّم بيانات صحيحة، بما في ذلك رقم جوال تملكه. حافظ على سرية كلمة المرور. أنت مسؤول عما يحدث في حسابك وعن الأشخاص الذين تدعوهم إلى شركتك.",
            "يدير المالك الشركة والفريق والفوترة، ويعمل المحاسب على بيانات الأعمال. ادعُ فقط من يحتاج إلى الوصول.",
          ],
        },
        { heading: "3. التجربة المجانية", body: ["يحصل كل حساب جديد ببريد إلكتروني ورقم جوال جديدين على تجربة مجانية واحدة لمدة 7 أيام بكل المزايا دون بطاقة. لا يُسمح بإنشاء حسابات إضافية للحصول على تجارب مجانية أخرى."] },
        {
          heading: "4. الباقات والأسعار والدفع",
          body: [
            "تُعرض الباقات وأسعارها بالريال السعودي في صفحة الأسعار. الأسعار لا تشمل ضريبة القيمة المضافة التي تُضاف بالنسبة السارية. تُدفع الباقات مقدماً لشهر أو ثلاثة أشهر أو اثني عشر شهراً، وسعر الباقة السنوية يساوي عشرة أضعاف السعر الشهري.",
            "لا يوجد خصم تلقائي. قبل انتهاء باقتك نرسل للمالك تذكيراً قبل سبعة أيام وقبل يوم واحد، وتجدد بالدفع من صفحة الفوترة. يبدأ تغيير الباقة أو دورة الدفع عند التجديد التالي.",
            "تتم معالجة المدفوعات لدى مزود الدفع، ولا نستلم رقم بطاقتك الكامل ولا نحفظه. تصدر فاتورة ضريبية باسم شركتك عن كل دفعة.",
          ],
        },
        {
          heading: "5. عند انتهاء التجربة أو الباقة",
          body: [
            "إذا انتهت التجربة، أو لم تُجدد الباقة المدفوعة خلال 3 أيام من انتهائها، تصبح شركتك في وضع القراءة فقط: يمكنك عرض بياناتك وتصديرها دون تعديلها. لا نحذف بياناتك بسبب انتهاء الباقة، والدفع يعيد الوصول الكامل.",
          ],
        },
        {
          heading: "6. بياناتك",
          body: [
            "بيانات شركتك ملك لشركتك. أنت مسؤول عن حقك في إدخال البيانات الشخصية لعمالك وعملائك وعن دقتها. نعالجها فقط لتقديم الخدمة كما توضح سياسة الخصوصية.",
            "يمكنك تصدير بياناتك في أي وقت. إذا طلبت إغلاق حساب شركتك نحذف بياناتها بعد مدة نتفق عليها معك، إلا ما يلزمنا النظام بالاحتفاظ به (مثل الفواتير الضريبية التي أصدرناها لك).",
          ],
        },
        { heading: "7. الاستخدام المقبول", body: ["لا تستخدم الخدمة لأي غرض غير نظامي، أو لإصدار فواتير مضللة، أو للوصول إلى بيانات شركات أخرى، أو لتعطيل الخدمة أو اختبار أمنها دون إذن كتابي منا."] },
        {
          heading: "8. الضريبة والامتثال",
          body: ["يساعدك البرنامج على إعداد الفواتير الضريبية بالبيانات ورمز QR المطلوبين لمرحلة الفوترة الإلكترونية التي ندعمها حالياً. تبقى مسؤولاً عن إقراراتك الضريبية وعن التحقق من متطلبات الفوترة الإلكترونية التي تنطبق على منشأتك."],
        },
        {
          heading: "9. التوفر والمسؤولية",
          body: ["نعمل على إبقاء الخدمة متاحة وبياناتك محفوظة بنسخ احتياطية، لكن لا يمكننا ضمان عدم انقطاعها أبداً. في الحدود التي يسمح بها النظام، تقتصر مسؤوليتنا الإجمالية عن أي مطالبة على ما دفعته لنا خلال الاثني عشر شهراً السابقة لها، ولا نتحمل الخسائر غير المباشرة مثل فوات الربح."],
        },
        { heading: "10. تعديل الشروط", body: ["قد نحدّث هذه الشروط، وسنبلغ الملاك بالبريد الإلكتروني قبل 14 يوماً على الأقل من سريان أي تغيير مهم."] },
        { heading: "11. النظام المطبق", body: ["تخضع هذه الشروط لأنظمة المملكة العربية السعودية، ويُعتمد النص العربي عند الاختلاف بين النسختين."] },
        { heading: "12. التواصل", body: [`للاستفسار عن هذه الشروط: ${EMAIL}.`] },
      ],
    },
  },
  privacy: {
    en: {
      title: "Privacy Policy",
      intro: `This policy explains what personal data ${SELLER_EN} handles in ${P}, why, where it is stored and what rights people have under Saudi Arabia's Personal Data Protection Law (PDPL).`,
      sections: [
        {
          heading: "1. Data we collect",
          body: [
            "Account data: name, email address, mobile number, password (stored only as a secure hash), language and sign-in records.",
            "Company data that your company enters: company details, clients, sites, invoices, payments, income and expenses.",
            "Worker data that your company enters: name, nationality, job, phone, salary and allowances, site, Iqama and passport numbers and expiry dates, timesheets and salary sheets.",
            "Billing data: plan, payment status and the tax invoices we issue. Card details are entered on the payment provider's page; we never receive the full card number.",
          ],
        },
        {
          heading: "2. Our role",
          body: [
            "For account and billing data we decide how it is used. For company and worker data your company decides what to enter and why; we process it on your company's behalf only to provide the service.",
          ],
        },
        {
          heading: "3. Why we use it",
          body: ["To provide and secure the service, verify your mobile number, send reminders and service emails, issue tax invoices, give support, and meet legal obligations. We do not sell personal data or use it for advertising."],
        },
        { heading: "4. Where data is stored", body: [`${LOCATION}.`, "Backups are encrypted and kept in a separate store in the same region."] },
        {
          heading: "5. Service providers",
          body: ["We use a small number of providers to run the service: hosting and database, email delivery, SMS delivery for verification codes, and a payment provider. They may only use the data to provide their service to us."],
        },
        {
          heading: "6. Security",
          body: [
            "Iqama and passport numbers are encrypted in the database and partly hidden in lists. Each company can only see its own data. Passwords are hashed, connections are encrypted, and important actions on money and salaries are logged.",
          ],
        },
        {
          heading: "7. How long we keep data",
          body: ["We keep data while your company account exists. Data is not deleted when a trial or plan ends. When an account is closed we delete its data after an agreed period, except records the law requires us to keep, such as tax invoices."],
        },
        {
          heading: "8. Your rights",
          body: [
            "Under the PDPL, people can ask to be informed about, access, get a copy of, correct and, where allowed, delete their personal data. Workers should send requests to the company that employs them; that company can correct or export the data in the app. For account data, contact us.",
          ],
        },
        { heading: "9. Contact", body: [`Privacy questions and requests: ${EMAIL}.`] },
      ],
    },
    ar: {
      title: "سياسة الخصوصية",
      intro: `توضح هذه السياسة البيانات الشخصية التي يتعامل معها ${SELLER_AR} في ${P}، ولماذا، وأين تُحفظ، وما الحقوق المقررة بموجب نظام حماية البيانات الشخصية في المملكة العربية السعودية.`,
      sections: [
        {
          heading: "1. البيانات التي نجمعها",
          body: [
            "بيانات الحساب: الاسم والبريد الإلكتروني ورقم الجوال وكلمة المرور (تُحفظ بصيغة مشفّرة غير قابلة للاسترجاع فقط) واللغة وسجلات الدخول.",
            "بيانات الشركة التي تدخلها شركتك: بيانات الشركة والعملاء والمواقع والفواتير والمدفوعات والإيرادات والمصروفات.",
            "بيانات العمال التي تدخلها شركتك: الاسم والجنسية والمهنة والجوال والراتب والبدلات والموقع وأرقام الإقامة والجواز وتواريخ انتهائها وكشوف الدوام ومسيرات الرواتب.",
            "بيانات الفوترة: الباقة وحالة الدفع والفواتير الضريبية التي نصدرها. تُدخل بيانات البطاقة في صفحة مزود الدفع، ولا نستلم رقم البطاقة الكامل أبداً.",
          ],
        },
        { heading: "2. دورنا", body: ["نحدد نحن طريقة استخدام بيانات الحساب والفوترة. أما بيانات الشركة والعمال فتحدد شركتك ما تدخله ولماذا، ونعالجها نيابة عنها فقط لتقديم الخدمة."] },
        { heading: "3. لماذا نستخدمها", body: ["لتقديم الخدمة وتأمينها، والتحقق من رقم جوالك، وإرسال التذكيرات ورسائل الخدمة، وإصدار الفواتير الضريبية، وتقديم الدعم، والوفاء بالالتزامات النظامية. لا نبيع البيانات الشخصية ولا نستخدمها للإعلان."] },
        { heading: "4. أين تُحفظ البيانات", body: [`${LOCATION}.`, "النسخ الاحتياطية مشفّرة وتُحفظ في مخزن منفصل في المنطقة نفسها."] },
        { heading: "5. مقدمو الخدمات", body: ["نستعين بعدد محدود من مقدمي الخدمات لتشغيل الخدمة: الاستضافة وقاعدة البيانات، وإرسال البريد الإلكتروني، وإرسال رسائل رموز التحقق، ومزود الدفع. لا يجوز لهم استخدام البيانات إلا لتقديم خدمتهم لنا."] },
        { heading: "6. الأمان", body: ["أرقام الإقامات والجوازات مشفّرة في قاعدة البيانات ومخفية جزئياً في القوائم. لا ترى كل شركة إلا بياناتها. كلمات المرور مشفّرة، والاتصالات مشفّرة، والإجراءات المهمة على الأموال والرواتب مسجّلة."] },
        { heading: "7. مدة الاحتفاظ", body: ["نحتفظ بالبيانات ما دام حساب شركتك قائماً، ولا تُحذف عند انتهاء التجربة أو الباقة. عند إغلاق الحساب نحذف بياناته بعد مدة متفق عليها، إلا ما يلزمنا النظام بالاحتفاظ به مثل الفواتير الضريبية."] },
        {
          heading: "8. حقوقك",
          body: ["بموجب نظام حماية البيانات الشخصية يحق للأفراد طلب العلم بمعالجة بياناتهم والوصول إليها والحصول على نسخة منها وتصحيحها وإتلافها عند الجواز. يرسل العمال طلباتهم إلى الشركة التي يعملون لديها، ويمكنها تصحيح البيانات أو تصديرها من التطبيق. وبالنسبة لبيانات الحساب تواصل معنا."],
        },
        { heading: "9. التواصل", body: [`للأسئلة والطلبات المتعلقة بالخصوصية: ${EMAIL}.`] },
      ],
    },
  },
  refund: {
    en: {
      title: "Refund Policy",
      intro: `We want you to pay only when ${P} works for you. That is why every new account starts with a free 7-day trial and there are no automatic charges.`,
      sections: [
        { heading: "1. Try first", body: ["Use the free trial to check the software with your own data before paying. No card is needed for the trial."] },
        { heading: "2. First payment", body: ["If you are not satisfied, you can ask for a full refund within 7 days of your company's first paid plan payment. Your company then returns to read-only mode."] },
        { heading: "3. Renewals", body: ["Renewal payments are not refunded for unused time. Because nothing renews automatically, you can simply choose not to renew; your data stays available in read-only mode."] },
        { heading: "4. Payment errors", body: ["Duplicate payments, or payments taken because of an error on our side, are refunded in full."] },
        {
          heading: "5. How refunds are paid",
          body: ["Refunds go back to the card or account used for the payment, usually within 14 working days depending on your bank. We issue a credit note for the refunded tax invoice."],
        },
        { heading: "6. How to ask", body: [`Email ${EMAIL} or message us on WhatsApp from the owner's account with your company name and invoice number.`] },
      ],
    },
    ar: {
      title: "سياسة الاسترداد",
      intro: `نريدك أن تدفع فقط عندما يناسبك ${P}. لذلك يبدأ كل حساب جديد بتجربة مجانية لمدة 7 أيام ولا يوجد أي خصم تلقائي.`,
      sections: [
        { heading: "1. جرّب أولاً", body: ["استخدم التجربة المجانية لتجربة البرنامج ببيانات شركتك قبل الدفع، دون الحاجة إلى بطاقة."] },
        { heading: "2. الدفعة الأولى", body: ["إذا لم تكن راضياً يمكنك طلب استرداد كامل خلال 7 أيام من أول دفعة لباقة مدفوعة لشركتك، وتعود شركتك بعدها إلى وضع القراءة فقط."] },
        { heading: "3. التجديد", body: ["لا تُسترد دفعات التجديد عن المدة غير المستخدمة. ولأنه لا يوجد تجديد تلقائي، يمكنك ببساطة عدم التجديد مع بقاء بياناتك متاحة في وضع القراءة فقط."] },
        { heading: "4. أخطاء الدفع", body: ["الدفعات المكررة أو المأخوذة بسبب خطأ من جانبنا تُسترد بالكامل."] },
        { heading: "5. طريقة الاسترداد", body: ["يُعاد المبلغ إلى البطاقة أو الحساب المستخدم في الدفع، عادة خلال 14 يوم عمل حسب البنك، ونصدر إشعاراً دائناً للفاتورة الضريبية المستردة."] },
        { heading: "6. كيف تطلب", body: [`راسلنا على ${EMAIL} أو عبر واتساب من حساب المالك مع اسم الشركة ورقم الفاتورة.`] },
      ],
    },
  },
};

export function legalDoc(kind: LegalKind, lang: Lang): LegalDoc {
  return DOCS[kind][lang];
}
