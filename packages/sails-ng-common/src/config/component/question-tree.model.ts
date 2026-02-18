import {
    FieldComponentConfig,
    FieldComponentDefinition,
} from "../field-component.model";
import {
    FieldModelConfig,
    FieldModelDefinition
} from "../field-model.model";
import {FormComponentDefinition} from "../form-component.model";
import {FormConfigVisitorOutline} from "../visitor/base.outline";
import {
    FieldComponentConfigKind, FieldComponentDefinitionKind,
    FieldModelConfigKind,
    FieldModelDefinitionKind, FormComponentDefinitionKind
} from "../shared.outline";
import {
    QuestionTreeComponentName,
    QuestionTreeFieldComponentConfigOutline,
    QuestionTreeFieldComponentDefinitionOutline,
    QuestionTreeFieldModelConfigOutline,
    QuestionTreeFieldModelDefinitionOutline,
    QuestionTreeFormComponentDefinitionOutline,
    QuestionTreeModelName,
    QuestionTreeModelValueType, QuestionTreeOutcome, QuestionTreeMeta,
    QuestionTreeQuestion
} from "./question-tree.outline";
import {
  AvailableFieldLayoutDefinitionOutlines, AvailableFormComponentDefinitionOutlines
} from "../dictionary.outline";


/* QuestionTree Component */

export class QuestionTreeFieldComponentConfig extends FieldComponentConfig implements QuestionTreeFieldComponentConfigOutline {
    availableOutcomes: QuestionTreeOutcome[];
    availableMeta?: QuestionTreeMeta;
    questions: QuestionTreeQuestion[];
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];

    constructor() {
        super();
        this.availableOutcomes = [];
        this.questions = [];
        this.componentDefinitions = [];
    }
}


export class QuestionTreeFieldComponentDefinition extends FieldComponentDefinition implements QuestionTreeFieldComponentDefinitionOutline {
    class = QuestionTreeComponentName;
    config?: QuestionTreeFieldComponentConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitQuestionTreeFieldComponentDefinition(this);
    }
}


/* QuestionTree Model */
export class QuestionTreeFieldModelConfig extends FieldModelConfig<QuestionTreeModelValueType> implements QuestionTreeFieldModelConfigOutline {
    constructor() {
        super();
    }
}

export class QuestionTreeFieldModelDefinition extends FieldModelDefinition<QuestionTreeModelValueType> implements QuestionTreeFieldModelDefinitionOutline {
    class = QuestionTreeModelName;
    config?: QuestionTreeFieldModelConfigOutline;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitQuestionTreeFieldModelDefinition(this);
    }
}


/* QuestionTree Form Component */
export class QuestionTreeFormComponentDefinition extends FormComponentDefinition implements QuestionTreeFormComponentDefinitionOutline {
    public component!: QuestionTreeFieldComponentDefinitionOutline;
    public model?: QuestionTreeFieldModelDefinitionOutline;
    public layout?: AvailableFieldLayoutDefinitionOutlines;

    constructor() {
        super();
    }

    accept(visitor: FormConfigVisitorOutline) {
        visitor.visitQuestionTreeFormComponentDefinition(this);
    }
}

export const QuestionTreeMap = [
    {kind: FieldComponentConfigKind, def: QuestionTreeFieldComponentConfig},
    {kind: FieldComponentDefinitionKind, def: QuestionTreeFieldComponentDefinition, class: QuestionTreeComponentName},
    {kind: FieldModelConfigKind, def: QuestionTreeFieldModelConfig},
    {kind: FieldModelDefinitionKind, def: QuestionTreeFieldModelDefinition, class: QuestionTreeModelName},
    {kind: FormComponentDefinitionKind, def: QuestionTreeFormComponentDefinition, class: QuestionTreeComponentName},
];
export const QuestionTreeDefaults = {
    [FormComponentDefinitionKind]: {
        [QuestionTreeComponentName]: {
            [FieldComponentDefinitionKind]: QuestionTreeComponentName,
            [FieldModelDefinitionKind]: QuestionTreeModelName,
        },
    },
};

