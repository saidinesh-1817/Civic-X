/**
 * AI Issue Classification Abstraction Layer
 * Designed for future plug-and-play integration with local or edge ML models
 * without relying on paid external APIs or compromising core system availability.
 */

export interface ClassificationResult {
  suggested_department_id?: string;
  suggested_department_name?: string;
  suggested_category?: string;
  confidence?: number;
  status: 'success' | 'unavailable';
  message?: string;
}

export interface IIssueClassifier {
  classify(image?: string, description?: string): Promise<ClassificationResult>;
}

/**
 * Default Local Fallback Classifier
 * Activates when no local AI model is loaded, ensuring zero side-effects on complaint submission.
 */
export class LocalFallbackClassifier implements IIssueClassifier {
  public async classify(
    _image?: string,
    _description?: string
  ): Promise<ClassificationResult> {
    return {
      status: 'unavailable',
      message:
        'Local AI classifier is not configured. Standard rule-based routing and manual department selection remain active.',
    };
  }
}

let activeClassifier: IIssueClassifier = new LocalFallbackClassifier();

export const getIssueClassifier = (): IIssueClassifier => activeClassifier;

export const setIssueClassifier = (classifier: IIssueClassifier): void => {
  activeClassifier = classifier;
};
