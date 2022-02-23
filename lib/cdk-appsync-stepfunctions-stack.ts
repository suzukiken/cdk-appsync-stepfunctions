import * as cdk from '@aws-cdk/core';
import * as appsync from "@aws-cdk/aws-appsync";
import * as iam from "@aws-cdk/aws-iam";
import * as sfn from "@aws-cdk/aws-stepfunctions";

export class CdkAppsyncStepfunctionsStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)
    
    // state machine
    
    const task = new sfn.Wait(this, "task", {
      time: sfn.WaitTime.duration(cdk.Duration.seconds(30)),
    })
    
    const definition = task

    const state_machine = new sfn.StateMachine(this, "state_machine", {
      definition,
      timeout: cdk.Duration.seconds(40),
    })
    
    // iam role
    
    var role = new iam.Role(this, "role", {
      assumedBy: new iam.ServicePrincipal('appsync.amazonaws.com')
    })
    
    const api_policy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "states:StartExecution"
      ],
      resources: [ 
        state_machine.stateMachineArn
      ]
    })

    role.attachInlinePolicy(new iam.Policy(this, 'AuthPolicy', {
      statements: [
        api_policy
      ]
    }))
    
    // api
    
    const schema = new appsync.Schema({
      filePath: "graphql/schema.graphql",
    })
    
    const api = new appsync.GraphqlApi(this, "Api", {
      name: id + "Api",
      logConfig: {
        fieldLogLevel: appsync.FieldLogLevel.ALL,
      },
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.IAM,
        }
      },
      schema: schema,
    })
    
    const httpds = api.addHttpDataSource(
      'HttpDataSource',
      'https://states.ap-northeast-1.amazonaws.com/',
      {
        authorizationConfig: {
          signingRegion: 'ap-northeast-1',
          signingServiceName: 'states',
        },
      },
    )
    
    state_machine.grantStartExecution(httpds)
    
    httpds.createResolver({
      typeName: 'Query',
      fieldName: 'run',
      requestMappingTemplate: appsync.MappingTemplate.fromString(
        `{
          "version": "2018-05-29",
          "method": "POST",
          "resourcePath": "/",
          "params": {
            "headers": {
              "content-type": "application/x-amz-json-1.0",
              "x-amz-target":"AWSStepFunctions.StartExecution"
            },
            "body": {
              "stateMachineArn": "` + state_machine.stateMachineArn + `"
            }
          }
        }`  
      ),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`$util.toJson($ctx.result)`)
    })
    
  }
}



