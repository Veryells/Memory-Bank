import { AnswerType } from "../../domain/enums/AnswerType.js";
import { ConfidenceLevel } from "../../domain/enums/ConfidenceLevel.js";
import { FieldType } from "../../domain/enums/FieldType.js";
import type { MatchResult, MatchedMemoryOption } from "../../domain/models/MatchResult.js";
import type { MemoryEntry } from "../../domain/models/MemoryEntry.js";
import type { QuestionSignature } from "../../domain/models/QuestionSignature.js";

interface ScoredCandidate {
  memory: MemoryEntry;
  score: number;
  reason: string;
}

export class MemoryMatchingService {
  private readonly minimumMatchScore = 0.35;

  match(signature: QuestionSignature, memories: MemoryEntry[]): MatchResult {
    const candidates = memories
      .filter((memory) => memory.enabled)
      .map((memory) => this.scoreCandidate(signature, memory))
      .filter((candidate): candidate is ScoredCandidate => candidate !== null)
      .sort((left, right) => right.score - left.score);

    const best = candidates[0];
    const presentedOptions = this.selectPresentedOptions(candidates, best);

    if (!best || best.score < this.minimumMatchScore) {
      return {
        hasMatch: false,
        confidenceScore: 0,
        confidenceLevel: ConfidenceLevel.None,
        reason: "No memory crossed the minimum confidence threshold.",
        alternateMemoryIds: candidates.slice(0, 3).map((candidate) => candidate.memory.id),
        options: presentedOptions.map((candidate) => this.toMatchedMemoryOption(candidate)),
      };
    }

    return {
      hasMatch: true,
      memoryId: best.memory.id,
      matchedQuestionText: best.memory.questionText,
      answer: best.memory.answer,
      confidenceScore: this.roundScore(best.score),
      confidenceLevel: this.getConfidenceLevel(best.score),
      reason: best.reason,
      alternateMemoryIds: candidates
        .slice(1, 4)
        .map((candidate) => candidate.memory.id),
      options: presentedOptions.map((candidate) => this.toMatchedMemoryOption(candidate)),
    };
  }

  private scoreCandidate(
    signature: QuestionSignature,
    memory: MemoryEntry,
  ): ScoredCandidate | null {
    const compatibility = this.getFieldTypeCompatibility(signature.fieldType, memory.answerType);

    if (compatibility === 0) {
      return null;
    }

    const exactMatch = signature.normalizedQuestionText === memory.normalizedQuestionText ? 1 : 0;
    const stringSimilarity = this.getStringSimilarity(
      signature.normalizedQuestionText,
      memory.normalizedQuestionText,
    );
    const keywordSimilarity = this.getKeywordSimilarity(
      signature.keywords,
      memory.normalizedQuestionText,
    );

    const score =
      exactMatch * 0.7 +
      stringSimilarity * 0.2 +
      keywordSimilarity * 0.1;

    const adjustedScore = score * compatibility;
    const reasonParts: string[] = [];

    if (exactMatch > 0) {
      reasonParts.push("Exact normalized question match.");
    } else if (stringSimilarity >= 0.85) {
      reasonParts.push("Near-exact normalized question match.");
    } else if (keywordSimilarity >= 0.5) {
      reasonParts.push("Keyword overlap suggests a likely match.");
    } else {
      reasonParts.push("Weak textual similarity.");
    }

    if (compatibility < 1) {
      reasonParts.push("Field type is only partially compatible.");
    } else {
      reasonParts.push("Field type is compatible.");
    }

    return {
      memory,
      score: adjustedScore,
      reason: reasonParts.join(" "),
    };
  }

  private getFieldTypeCompatibility(fieldType: FieldType, answerType: AnswerType): number {
    switch (fieldType) {
      case FieldType.Text:
      case FieldType.TextArea:
        return answerType === AnswerType.Text ? 1 : 0;
      case FieldType.Select:
        if (answerType === AnswerType.SelectChoice) {
          return 1;
        }

        return answerType === AnswerType.Text ? 0.85 : 0;
      case FieldType.Checkbox:
        return answerType === AnswerType.Boolean ? 1 : 0;
      case FieldType.Radio:
        if (answerType === AnswerType.SelectChoice) {
          return 1;
        }

        return answerType === AnswerType.Text ? 0.85 : 0;
      case FieldType.Unknown:
      default:
        return 0.85;
    }
  }

  private toMatchedMemoryOption(candidate: ScoredCandidate): MatchedMemoryOption {
    return {
      memoryId: candidate.memory.id,
      questionText: candidate.memory.questionText,
      answer: candidate.memory.answer,
      confidenceScore: this.roundScore(candidate.score),
      confidenceLevel: this.getConfidenceLevel(candidate.score),
      reason: candidate.reason,
    };
  }

  private selectPresentedOptions(
    candidates: ScoredCandidate[],
    best: ScoredCandidate | undefined,
  ): ScoredCandidate[] {
    if (!best) {
      return candidates
        .filter((candidate) => candidate.score >= this.minimumMatchScore)
        .slice(0, 4);
    }

    return candidates
      .filter((candidate) =>
        candidate.score >= this.minimumMatchScore
        && (
          candidate.memory.normalizedQuestionText === best.memory.normalizedQuestionText
          || best.score - candidate.score <= 0.05
        ),
      )
      .slice(0, 4);
  }

  private getStringSimilarity(left: string, right: string): number {
    if (!left || !right) {
      return 0;
    }

    if (left === right) {
      return 1;
    }

    const distance = this.getLevenshteinDistance(left, right);
    const longestLength = Math.max(left.length, right.length);

    return longestLength === 0 ? 0 : 1 - distance / longestLength;
  }

  private getKeywordSimilarity(keywords: string[], candidateText: string): number {
    if (keywords.length === 0) {
      return 0;
    }

    const candidateTokens = new Set(candidateText.split(" ").filter(Boolean));
    const overlap = keywords.filter((keyword) => candidateTokens.has(keyword)).length;

    return overlap / keywords.length;
  }

  private getLevenshteinDistance(left: string, right: string): number {
    const rows = left.length + 1;
    const columns = right.length + 1;
    const matrix = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

    for (let row = 0; row < rows; row += 1) {
      matrix[row]![0] = row;
    }

    for (let column = 0; column < columns; column += 1) {
      matrix[0]![column] = column;
    }

    for (let row = 1; row < rows; row += 1) {
      for (let column = 1; column < columns; column += 1) {
        const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
        const deletion = matrix[row - 1]![column]! + 1;
        const insertion = matrix[row]![column - 1]! + 1;
        const substitution = matrix[row - 1]![column - 1]! + substitutionCost;

        matrix[row]![column] = Math.min(deletion, insertion, substitution);
      }
    }

    return matrix[rows - 1]![columns - 1]!;
  }

  private getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.85) {
      return ConfidenceLevel.High;
    }

    if (score >= 0.6) {
      return ConfidenceLevel.Medium;
    }

    if (score >= this.minimumMatchScore) {
      return ConfidenceLevel.Low;
    }

    return ConfidenceLevel.None;
  }

  private roundScore(score: number): number {
    return Math.round(score * 1000) / 1000;
  }
}
