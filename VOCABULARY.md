# CLAUDE.md - Vocabulary Tab

## Overview

The Vocabulary tab helps users acquire German vocabulary through active recall and spoken repetition.

The learning philosophy is:

1. Learn new words.
2. Recall them from memory.
3. Repeat difficult words until mastered.

The goal is **active vocabulary acquisition**, not passive reading.

---

# User Flow

## Step 1 – Choose a Category

The user can either:

- Select one of the built-in categories.
- Enter a custom category (e.g. "Space", "Camping", "Photography").

The AI should generate exactly **10 useful, commonly used German words** for the chosen topic.

Avoid obscure vocabulary.

Prefer words that are useful in everyday conversation.

---

## Step 2 – Learning Phase

Present one word at a time.

For each word:

1. Show the base language word.
2. Speak the base language word.
3. Pause briefly.
4. Show the German translation.
5. Speak the German translation.

Example:

Apple

↓

der Apfel

The pace should be comfortable and encourage listening.

No grammar explanations during this phase.

---

## Step 3 – Quiz Phase

After all 10 words have been introduced, begin a quiz.

Ask the words in random order.

Example:

"How do you say 'apple' in German?"

The user answers by voice.

---

# Mastery System

Each word has a mastery score.

Default requirement:

2 consecutive correct answers.

Example:

Correct:

0 → 1 → 2 → mastered

Incorrect:

Reset mastery to 0.

Mastered words are removed from the active pool.

Continue asking only the remaining words until every word has been mastered.

---

# Feedback

Correct answer:

✓ Correct!

Incorrect answer:

Say the correct German word.

Optionally pronounce it again.

Do not provide long grammar explanations.

Keep the quiz moving.

---

# Session Completion

When every word has reached mastery:

Display a summary.

Example:

Category:
Kitchen

Words:
10

Questions asked:
18

Accuracy:
83%

Most difficult words:

- das Messer
- die Gabel
- der Löffel

Celebrate completion with a simple success message.

---

# Built-in Categories

## Everyday

- Food
- Drinks
- Fruits
- Vegetables
- Kitchen
- Home
- Furniture
- Clothing
- Bathroom
- Bedroom

## Travel

- Airport
- Hotel
- Restaurant
- Grocery Store
- Train Station
- Public Transport
- Directions
- Vacation

## People

- Family
- Friends
- Jobs
- Emotions
- Body Parts
- Health

## Daily Life

- School
- Work
- Technology
- Shopping
- Hobbies
- Sports

## Nature

- Animals
- Plants
- Weather
- Geography

## Grammar

- Common Verbs
- Modal Verbs
- Adjectives
- Adverbs
- Prepositions
- Question Words
- Conjunctions
- Separable Verbs

## Conversation

- Greetings
- Polite Expressions
- Small Talk
- Ordering Food
- Emergencies

## Frequency Lists

- Top 100 Nouns
- Top 100 Verbs
- Top 100 Adjectives
- Top 100 Adverbs
- Top 100 Everyday Phrases

These should be divided into manageable sessions of 10 words each.

---

# AI Guidelines

When generating vocabulary:

- Prefer words a beginner or intermediate learner is likely to encounter.
- Avoid rare, technical, or literary vocabulary.
- Avoid duplicate or near-duplicate words.
- Keep categories balanced.
- Prefer nouns with their correct article (der, die, das).
- For verbs, use the infinitive.
- For adjectives and adverbs, use the base form.

The vocabulary should feel practical and immediately useful.

---

# Voice Interaction

The Vocabulary tab should be fully usable without a mouse.

The ideal flow is:

AI:
"Apple"

↓

AI:
"der Apfel"

↓

...

↓

AI:
"How do you say 'bread'?"

↓

User speaks.

↓

Immediate feedback.

↓

Next question.

The user should be able to complete an entire vocabulary session hands-free.

---

# Future Enhancements

Potential improvements:

- Difficulty levels (A1–C1).
- Example sentence after a word is mastered.
- Reverse quiz (German → base language).
- Spaced repetition across sessions.
- Daily vocabulary challenge.
- Pronunciation scoring during quiz mode.
- Personal "difficult words" list generated from past sessions.

---

# Design Philosophy

The Vocabulary tab should feel like a friendly tutor rather than a flashcard app.

Keep interactions fast, encouraging, and focused on speaking.

Minimize unnecessary explanations.

Maximize repetition, recall, and confidence-building.

A user should be able to complete a full 10-word vocabulary session in approximately 5–10 minutes and leave with vocabulary they can actively recall and pronounce.
