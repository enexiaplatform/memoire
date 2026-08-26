import { Link } from 'react-router-dom';
import { GuideFurther, GuideLayout, GuidePoint, GuideQuote, GuideSection } from './GuideLayout';

/**
 * The problem-aware page.
 *
 * "My deal went quiet" is the sentence this whole product was built around, and
 * until now the only page that said it was the landing page - where it arrives
 * after the brand name, to a reader who already clicked. This is the version
 * for somebody who has not heard of Memoire and is typing the problem into a
 * search box at 11pm on a Sunday.
 *
 * The four silences and the three causes are the product's actual model, stated
 * without the product. If the argument here is wrong, the software is wrong too
 * - which is the honest way round for a page like this to be written.
 */

const PUBLISHED = '2026-08-26';
const UPDATED = '2026-08-26';

export function WhyDealsGoQuietPage() {
  return (
    <GuideLayout
      title="Why Deals Go Quiet - And How to Catch It | Memoire"
      description="Deals rarely die on a decision. They stop being watched. The four silences in a B2B cycle, why each one happens, and how to catch them in time."
      path="/why-deals-go-quiet"
      eyebrow="The quiet failures"
      heading="Deals don't die. They go quiet."
      standfirst="Almost nothing in a B2B pipeline fails loudly. There is no rejection email, no lost notification, no moment you could point at afterwards. There is a thread that was moving, and then a Tuesday where it wasn't, and nobody was assigned to notice the difference."
      published={PUBLISHED}
      updated={UPDATED}
    >
      <GuideSection id="what-silence-is" title="Silence is not an event, and that is the whole problem">
        <p>
          Every system you use is built to record things that happen. A stage changes, a document is signed, an
          invoice is raised, a payment clears. Each one is an event: something occurred, someone recorded it, and
          the record is now different from how it was.
        </p>
        <p>
          Going quiet is the absence of an event. Nothing occurred, so nothing was recorded, so nothing changed —
          and a system that only reacts to changes has no way to react at all. This is why the deal that has been
          untouched for six weeks looks, in almost every tool, exactly like the deal you spoke to yesterday. Both
          say <em>Proposal</em>. Neither one has a flag on it. The difference between them exists only in the head
          of the person who happens to remember.
        </p>
        <GuideQuote>
          &ldquo;I sent the quote three weeks ago. Then nothing.&rdquo; The deal did not die. It stopped being
          anybody&apos;s job.
        </GuideQuote>
        <p>
          Which means the fix is not discipline, and it is not a better memory. It is deciding, in advance, what
          counts as too long — and having something that measures the gap for you, because measuring an absence is
          the one thing a person genuinely cannot do by feel across thirty open threads.
        </p>
      </GuideSection>

      <GuideSection id="four-silences" title="The four silences, in the order they cost you">
        <p>
          Most advice about follow-up stops at the quote. In a business where you also deliver something and get
          paid for it, that is the first of four places the thread can go quiet, and it is not the most expensive
          one.
        </p>

        <GuidePoint index={1} title="After the quote: the deal that stopped being anybody's job">
          <p>
            You sent it. They said they would come back. There was no next date, because the next move was theirs —
            and an open thread with no date on it is a thread nobody owns. Three weeks later the champion has moved
            on to something else, and re-opening the conversation now costs you the price: you will be asked to
            re-quote against a number that has since been shopped around.
          </p>
          <p className="text-gray-500">
            <strong className="text-gray-700">What it costs:</strong> the margin you gave away to restart a
            conversation that never needed to stop.
          </p>
        </GuidePoint>

        <GuidePoint index={2} title="After the win: delivered, and never invoiced">
          <p>
            Winning feels like the finish line, so attention moves to the next deal. But between <em>Won</em> and
            <em> paid</em> there are five or six steps that belong to nobody in particular: the contract, the
            deposit, the shipment, the delivery confirmation, the invoice. Each one is somebody assuming somebody
            else is on it.
          </p>
          <p>
            The gap between what you have delivered and what you have invoiced is the purest form of this. It is
            work you have already done, cost you have already paid, and revenue you have not asked for. In most
            businesses nobody looks at that gap as a number, because the sales tool stops at Won and the accounting
            tool starts at the invoice.
          </p>
          <p className="text-gray-500">
            <strong className="text-gray-700">What it costs:</strong> your own cash, sitting in the gap between two
            systems.
          </p>
        </GuidePoint>

        <GuidePoint index={3} title="After the invoice: money that is late and nobody said so">
          <p>
            The payment terms were agreed at quote time — 30 days, 50% with the order, whatever it was. Then they
            were written on a PDF and never turned into a date anybody watches. So &ldquo;late&rdquo; becomes
            something you discover during a cash squeeze rather than something you were told on the day it happened.
          </p>
          <p>
            The terms are already the answer here. If a term exists, the due date is arithmetic; if you know the due
            date, aging is arithmetic too. Nothing about collection requires new data entry — it requires that the
            term written at the start is carried forward instead of retyped.
          </p>
          <p className="text-gray-500">
            <strong className="text-gray-700">What it costs:</strong> weeks of float on money you already earned.
          </p>
        </GuidePoint>

        <GuidePoint index={4} title="Before the review: the answer you knew in June and cannot find">
          <p>
            Your manager asks why the deal slipped. You knew in June: procurement wanted a lead-time guarantee, the
            economic buyer changed, the reference call never got booked. But the record has a stage and an amount,
            and the reasoning lived in an email thread you would now have to reconstruct.
          </p>
          <p>
            So the review gets answered from memory, which means it gets answered vaguely, which means the forecast
            gets discounted — not because the deal is weak, but because the evidence for it was never written down
            at the time it was free to write.
          </p>
          <p className="text-gray-500">
            <strong className="text-gray-700">What it costs:</strong> credibility, which is priced into every
            number you give afterwards.
          </p>
        </GuidePoint>
      </GuideSection>

      <GuideSection id="why-it-happens" title="Three structural reasons, none of them about effort">
        <p>
          It is worth being precise that none of these are personal failings. People who lose deals to silence are
          not lazier than people who do not; they are usually carrying more threads. The causes are structural.
        </p>
        <p>
          <strong className="text-navy">Your system of record stores outcomes, not evidence.</strong> A CRM is
          designed to answer the company&apos;s question — what stage, how much, when. It is not designed to answer
          yours: what did they actually say, what did I promise, what has to be true for this to close. Those go in
          a notes field nobody reads, or nowhere.
        </p>
        <p>
          <strong className="text-navy">Ownership ends at Won.</strong> Pipeline tools are built for the part of the
          business that ends with a signature. Everything after it belongs to operations, or finance, or nobody —
          and &ldquo;nobody&rdquo; is not a person you can ask.
        </p>
        <p>
          <strong className="text-navy">Nothing fires when nothing happens.</strong> Reminders are set by the person
          who would have remembered anyway. The threads that go quiet are precisely the ones you did not think to
          set a reminder on, because at the time there was nothing to remind yourself about.
        </p>
      </GuideSection>

      <GuideSection id="what-to-do" title="What to do about it, with or without software">
        <p>
          These four work on a spreadsheet, a notebook or a paid tool. They are ordered by how much they return for
          the effort.
        </p>
        <p>
          <strong className="text-navy">1. Give every open thread a dated next action.</strong> Not
          &ldquo;follow up&rdquo; — a date, and a specific move. An undated intention is not being watched by
          anything, including you. If you cannot name the next move, that is itself the finding: the deal has no
          next step and should be treated as at risk today rather than in a month.
        </p>
        <p>
          <strong className="text-navy">2. Decide what &ldquo;quiet&rdquo; means, as a number.</strong> Fourteen
          days in a transactional cycle, forty-five in a long procurement one. The number matters less than having
          one, because a threshold turns a feeling into a filter you can run every week. Without it, &ldquo;which
          deals have gone quiet&rdquo; is a question you can only answer by re-reading everything.
        </p>
        <p>
          <strong className="text-navy">3. Keep watching past the win.</strong> Track the same thread through
          contract, deposit, delivery, invoice and payment. The two numbers worth having in front of you every week
          are <em>delivered but not invoiced</em> and <em>invoiced and overdue</em>. Both are money you have already
          earned, and both are invisible in the tool that stopped at Won.
        </p>
        <p>
          <strong className="text-navy">4. Write the evidence at the time, not at review time.</strong> Two lines
          after a call — what they said, what you promised, what has to be true — cost almost nothing on the day and
          cannot be reconstructed three months later at any price. This is the habit with the widest gap between how
          cheap it is and how much it is worth.
        </p>
      </GuideSection>

      <GuideSection id="how-memoire" title="How Memoire does this">
        <p>
          Memoire is built around exactly the argument above. You capture what happened with a customer once, in
          whatever mess it arrived in — a pasted email, a call note, a voice-to-text dump. It is parsed on your own
          device into an account, an amount, an objection and a dated next action, and filed against the right deal.
        </p>
        <p>
          From then on the silence is measured for you. <strong className="text-navy">Today</strong> opens on the
          deals that have gone quiet, the promises you have not kept and the money that is late — ranked, capped at
          five, each one carrying a <em>&ldquo;Why am I seeing this?&rdquo;</em> you can open. The watch-list does
          not stop at Won: <Link to="/quote-to-cash" className="text-brand-blue underline underline-offset-4">
          the same thread is followed</Link> through delivery and invoicing to the payment landing, with due dates
          derived from the terms already written on the quote.
        </p>
        <p>
          There is no AI service behind any of it, and no writeback to your CRM. Your customer names, prices and
          notes stay yours.
        </p>
      </GuideSection>

      <GuideFurther
        links={[
          {
            to: '/quote-to-cash',
            title: 'Quote to cash, when the whole process is one person',
            blurb: 'The seven steps between a signature and the money landing, and the three places a small team loses cash in them.',
          },
          {
            to: '/use-cases',
            title: 'Four jobs Memoire is built around',
            blurb: 'What changes between a quota carrier, a founder-led seller, a distributor and a long procurement cycle.',
          },
        ]}
      />
    </GuideLayout>
  );
}
