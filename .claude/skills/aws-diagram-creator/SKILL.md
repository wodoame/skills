---
name: aws-diagram-creator
description: Create or edit clean, professional AWS architecture diagrams as draw.io (.drawio) files, following the user's established visual preferences. Use whenever the user asks to draw, create, update, or fix an AWS architecture / infrastructure / network diagram.
---

# AWS Diagram Creator

Create and edit clean, professional AWS architecture diagrams saved as `.drawio` files. Use the draw.io XML format (mxGraph) with official AWS shape libraries.

## Core Workflow

1. Ask the user what they want to diagram if no description is given.
2. Ask clarifying questions about scope: which AWS services, how they connect, and any groupings (VPCs, AZs, accounts).
3. Ask if there is an existing `.drawio` file to update, or if this is a new diagram.
4. Generate or update the `.drawio` XML file.
5. Summarize what was created: components, connections, and groups.

## File Format

Draw.io files are XML. The root structure:

```xml
<mxfile host="app.diagrams.net">
  <diagram name="Architecture">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- diagram elements go here -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

Every element is an `mxCell`. Use sequential numeric IDs starting from 2. Always set `parent="1"` for top-level elements, or `parent="<container-id>"` when placing elements inside a group.

## AWS Shape Styles

Use the official AWS 4 shape library. Shapes follow the pattern `shape=mxgraph.aws4.<service>`.

### Common shapes

| Service | Style value |
|---|---|
| EC2 instance | `shape=mxgraph.aws4.instance` |
| EC2 Auto Scaling | `shape=mxgraph.aws4.auto_scaling` |
| Lambda | `shape=mxgraph.aws4.lambda` |
| S3 | `shape=mxgraph.aws4.s3` |
| RDS | `shape=mxgraph.aws4.rds` |
| DynamoDB | `shape=mxgraph.aws4.dynamodb` |
| ElastiCache | `shape=mxgraph.aws4.elasticache` |
| API Gateway | `shape=mxgraph.aws4.api_gateway` |
| CloudFront | `shape=mxgraph.aws4.cloudfront` |
| Route 53 | `shape=mxgraph.aws4.route_53` |
| Load Balancer (ALB) | `shape=mxgraph.aws4.application_load_balancer` |
| VPC | `shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc` |
| Subnet | `shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet` |
| Security Group | `shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_security_group` |
| Availability Zone | `shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_availability_zone` |
| AWS Account | `shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_account` |
| IAM | `shape=mxgraph.aws4.identity_and_access_management` |
| SNS | `shape=mxgraph.aws4.sns` |
| SQS | `shape=mxgraph.aws4.sqs` |
| CloudWatch | `shape=mxgraph.aws4.cloudwatch` |
| ECS | `shape=mxgraph.aws4.ecs` |
| EKS | `shape=mxgraph.aws4.eks` |
| ECR | `shape=mxgraph.aws4.ecr` |
| Fargate | `shape=mxgraph.aws4.fargate` |
| Secrets Manager | `shape=mxgraph.aws4.secrets_manager` |
| Cognito | `shape=mxgraph.aws4.cognito` |
| WAF | `shape=mxgraph.aws4.waf` |
| Internet Gateway | `shape=mxgraph.aws4.internet_gateway` |
| NAT Gateway | `shape=mxgraph.aws4.nat_gateway` |
| Direct Connect | `shape=mxgraph.aws4.direct_connect` |
| VPN | `shape=mxgraph.aws4.vpn` |
| Kinesis | `shape=mxgraph.aws4.kinesis` |
| Glue | `shape=mxgraph.aws4.glue` |
| Athena | `shape=mxgraph.aws4.athena` |
| Redshift | `shape=mxgraph.aws4.redshift` |
| Step Functions | `shape=mxgraph.aws4.step_functions` |
| EventBridge | `shape=mxgraph.aws4.eventbridge` |
| CodePipeline | `shape=mxgraph.aws4.codepipeline` |
| CodeBuild | `shape=mxgraph.aws4.codebuild` |
| Elastic Beanstalk | `shape=mxgraph.aws4.elastic_beanstalk` |
| Internet (generic) | `shape=mxgraph.aws4.internet_alt1` |
| User / Client | `shape=mxgraph.aws4.users` |
| Mobile client | `shape=mxgraph.aws4.mobile_client` |

Full node style for a service icon:
```
outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#E7157B;labelBackgroundColor=#ffffff;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.lambda;
```

Adjust `fillColor` per AWS category colour (see below).

## AWS Category Colours

| Category | Fill colour |
|---|---|
| Compute (EC2, Lambda, ECS…) | `#ED7100` |
| Storage (S3, EBS…) | `#3F8624` |
| Database (RDS, DynamoDB…) | `#C7131F` |
| Networking (VPC, Route 53, CF…) | `#8C4FFF` |
| Security (IAM, WAF, Cognito…) | `#DD344C` |
| Messaging (SNS, SQS, EventBridge…) | `#E7157B` |
| Analytics (Kinesis, Glue, Athena…) | `#8C4FFF` |
| Developer Tools (CodePipeline…) | `#C7131F` |
| Management (CloudWatch…) | `#E7157B` |

## Groups and Containers

Groups (VPC, Subnet, AZ, Account) are swimlane-style containers. Set `vertex="1"` and include child elements with `parent="<group-id>"`.

```xml
<!-- VPC container -->
<mxCell id="10" value="VPC (10.0.0.0/16)" style="points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_vpc;strokeColor=#8C4FFF;fillColor=#F4ECFF;verticalLabelPosition=top;verticalAlign=bottom;align=center;html=1;fontSize=13;fontStyle=1;" vertex="1" parent="1">
  <mxGeometry x="160" y="160" width="640" height="400" as="geometry" />
</mxCell>

<!-- Public Subnet inside VPC -->
<mxCell id="11" value="Public Subnet" style="points=[[0,0],[0.25,0],[0.5,0],[0.75,0],[1,0],[1,0.25],[1,0.5],[1,0.75],[1,1],[0.75,1],[0.5,1],[0.25,1],[0,1],[0,0.75],[0,0.5],[0,0.25]];shape=mxgraph.aws4.group;grIcon=mxgraph.aws4.group_subnet;strokeColor=#3F8624;fillColor=#EBF5E0;verticalLabelPosition=top;verticalAlign=bottom;align=center;html=1;fontSize=12;" vertex="1" parent="10">
  <mxGeometry x="40" y="60" width="260" height="280" as="geometry" />
</mxCell>
```

## Edges (Connections)

```xml
<mxCell id="50" style="edgeStyle=orthogonalEdgeStyle;html=1;exitX=1;exitY=0.5;exitDx=0;exitDy=0;entryX=0;entryY=0.5;entryDx=0;entryDy=0;" edge="1" source="20" target="21" parent="1">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
```

Add a label to an edge by setting `value="HTTPS"` on the mxCell. Use `dashed=1;` in the style for optional or async paths.

## Layout Conventions

- **Left to right**: client/internet → edge (CloudFront, Route 53) → load balancer → compute → data stores
- **Top to bottom** inside groups when showing tiers
- Align icons on a grid (snap to 80 px or 160 px increments)
- Group related services inside containers before placing unrelated icons next to them
- Leave at least 40 px padding between a container border and its children
- Keep icon size at 60×60 for services; 78×78 for prominent services
- Label every icon; use short names (e.g. "ALB", "Lambda – auth", "RDS Primary")
- Place the label below the icon (`verticalLabelPosition=bottom;verticalAlign=top;`)

## Interaction Rules

- Always write the complete `.drawio` file — never partial fragments.
- When editing an existing file, read it first with the Read tool, then produce the updated full file.
- Ask before adding services the user did not mention.
- If a requested AWS service has no official shape, use the generic resource shape: `shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.general`.
- After writing the file, summarize: number of services, groups, and connections added or changed.
- If the user asks for a specific layout (e.g. "make it horizontal"), honour it over these defaults.

## Example Minimal Diagram

A simple Lambda + API Gateway + DynamoDB pattern:

```xml
<mxfile host="app.diagrams.net">
  <diagram name="Serverless API">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />

        <!-- Client -->
        <mxCell id="2" value="Client" style="outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#232F3E;labelBackgroundColor=#ffffff;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.users;verticalLabelPosition=bottom;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="80" y="320" width="60" height="60" as="geometry" />
        </mxCell>

        <!-- API Gateway -->
        <mxCell id="3" value="API Gateway" style="outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#E7157B;labelBackgroundColor=#ffffff;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.api_gateway;verticalLabelPosition=bottom;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="240" y="320" width="60" height="60" as="geometry" />
        </mxCell>

        <!-- Lambda -->
        <mxCell id="4" value="Lambda" style="outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#ED7100;labelBackgroundColor=#ffffff;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.lambda;verticalLabelPosition=bottom;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="400" y="320" width="60" height="60" as="geometry" />
        </mxCell>

        <!-- DynamoDB -->
        <mxCell id="5" value="DynamoDB" style="outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;fillColor=#C7131F;labelBackgroundColor=#ffffff;align=center;html=1;fontSize=12;fontStyle=0;aspect=fixed;shape=mxgraph.aws4.dynamodb;verticalLabelPosition=bottom;verticalAlign=top;" vertex="1" parent="1">
          <mxGeometry x="560" y="320" width="60" height="60" as="geometry" />
        </mxCell>

        <!-- Edges -->
        <mxCell id="6" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" source="2" target="3" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="7" value="HTTPS" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" source="3" target="4" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
        <mxCell id="8" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" source="4" target="5" parent="1">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

## Output Filename Convention

Default filename: `architecture.drawio`

If the user names the diagram (e.g. "draw the data pipeline"), use a kebab-case name: `data-pipeline.drawio`.

Always write the file using the Write tool, not as a code block only, so the user can open it directly in draw.io or VS Code with the draw.io extension.
