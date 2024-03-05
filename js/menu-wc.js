'use strict';

customElements.define('compodoc-menu', class extends HTMLElement {
    constructor() {
        super();
        this.isNormalMode = this.getAttribute('mode') === 'normal';
    }

    connectedCallback() {
        this.render(this.isNormalMode);
    }

    render(isNormalMode) {
        let tp = lithtml.html(`
        <nav>
            <ul class="list">
                <li class="title">
                    <a href="index.html" data-type="index-link">ReDBox Portal - NG2 Apps</a>
                </li>

                <li class="divider"></li>
                ${ isNormalMode ? `<div id="book-search-input" role="search"><input type="text" placeholder="Type to search"></div>` : '' }
                <li class="chapter">
                    <a data-type="chapter-link" href="index.html"><span class="icon ion-ios-home"></span>Getting started</a>
                    <ul class="links">
                        <li class="link">
                            <a href="overview.html" data-type="chapter-link">
                                <span class="icon ion-ios-keypad"></span>Overview
                            </a>
                        </li>
                        <li class="link">
                            <a href="index.html" data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>README
                            </a>
                        </li>
                        <li class="link">
                            <a href="contributing.html"  data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>CONTRIBUTING
                            </a>
                        </li>
                        <li class="link">
                            <a href="license.html"  data-type="chapter-link">
                                <span class="icon ion-ios-paper"></span>LICENSE
                            </a>
                        </li>
                                <li class="link">
                                    <a href="dependencies.html" data-type="chapter-link">
                                        <span class="icon ion-ios-list"></span>Dependencies
                                    </a>
                                </li>
                                <li class="link">
                                    <a href="properties.html" data-type="chapter-link">
                                        <span class="icon ion-ios-apps"></span>Properties
                                    </a>
                                </li>
                    </ul>
                </li>
                    <li class="chapter additional">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#additional-pages"'
                            : 'data-bs-target="#xs-additional-pages"' }>
                            <span class="icon ion-ios-book"></span>
                            <span>Additional documentation</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="additional-pages"' : 'id="xs-additional-pages"' }>
                                    <li class="link ">
                                        <a href="additional-documentation/installation-guide.html" data-type="entity-link" data-context-id="additional">Installation guide</a>
                                    </li>
                                    <li class="chapter inner">
                                        <a data-type="chapter-link" href="additional-documentation/configuration-guide.html" data-context-id="additional">
                                            <div class="menu-toggler linked" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#additional-page-4eb17d98569380129f72e728c5d196583cde0ff06f065e89db27811e4bf508497b4aebbc523bfcfa62650f2d181639992e517f8aaf72f77e2c091296f1c91694"' : 'data-bs-target="#xs-additional-page-4eb17d98569380129f72e728c5d196583cde0ff06f065e89db27811e4bf508497b4aebbc523bfcfa62650f2d181639992e517f8aaf72f77e2c091296f1c91694"' }>
                                                <span class="link-name">Configuration guide</span>
                                                <span class="icon ion-ios-arrow-down"></span>
                                            </div>
                                        </a>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="additional-page-4eb17d98569380129f72e728c5d196583cde0ff06f065e89db27811e4bf508497b4aebbc523bfcfa62650f2d181639992e517f8aaf72f77e2c091296f1c91694"' : 'id="xs-additional-page-4eb17d98569380129f72e728c5d196583cde0ff06f065e89db27811e4bf508497b4aebbc523bfcfa62650f2d181639992e517f8aaf72f77e2c091296f1c91694"' }>
                                            <li class="link for-chapter2">
                                                <a href="additional-documentation/configuration-guide/configuring-web-forms.html" data-type="entity-link" data-context="sub-entity" data-context-id="additional">Configuring web forms</a>
                                            </li>
                                            <li class="link for-chapter2">
                                                <a href="additional-documentation/configuration-guide/configuring-email-notifications.html" data-type="entity-link" data-context="sub-entity" data-context-id="additional">Configuring email notifications</a>
                                            </li>
                                            <li class="link for-chapter2">
                                                <a href="additional-documentation/configuration-guide/configuring-integration-with-redbox-and-mint.html" data-type="entity-link" data-context="sub-entity" data-context-id="additional">Configuring integration with RedBox and Mint</a>
                                            </li>
                                            <li class="link for-chapter2">
                                                <a href="additional-documentation/configuration-guide/configuring-authentication.html" data-type="entity-link" data-context="sub-entity" data-context-id="additional">Configuring authentication</a>
                                            </li>
                                        </ul>
                                    </li>
                                    <li class="link ">
                                        <a href="additional-documentation/rest-api-documentation.html" data-type="entity-link" data-context-id="additional">REST API documentation</a>
                                    </li>
                        </ul>
                    </li>
                    <li class="chapter modules">
                        <a data-type="chapter-link" href="modules.html">
                            <div class="menu-toggler linked" data-bs-toggle="collapse" ${ isNormalMode ?
                                'data-bs-target="#modules-links"' : 'data-bs-target="#xs-modules-links"' }>
                                <span class="icon ion-ios-archive"></span>
                                <span class="link-name">Modules</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                        </a>
                        <ul class="links collapse " ${ isNormalMode ? 'id="modules-links"' : 'id="xs-modules-links"' }>
                            <li class="link">
                                <a href="modules/DashboardModule.html" data-type="entity-link" >DashboardModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#components-links-module-DashboardModule-943d559ecd1a841a67c5f93f3d9ae4f466aea0780d035c00813fe309df81a70e9dfddbf6e7dd1e0ec5749c63c62e3e2d99779a09331241e4d9a269f52afdee51"' : 'data-bs-target="#xs-components-links-module-DashboardModule-943d559ecd1a841a67c5f93f3d9ae4f466aea0780d035c00813fe309df81a70e9dfddbf6e7dd1e0ec5749c63c62e3e2d99779a09331241e4d9a269f52afdee51"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-DashboardModule-943d559ecd1a841a67c5f93f3d9ae4f466aea0780d035c00813fe309df81a70e9dfddbf6e7dd1e0ec5749c63c62e3e2d99779a09331241e4d9a269f52afdee51"' :
                                            'id="xs-components-links-module-DashboardModule-943d559ecd1a841a67c5f93f3d9ae4f466aea0780d035c00813fe309df81a70e9dfddbf6e7dd1e0ec5749c63c62e3e2d99779a09331241e4d9a269f52afdee51"' }>
                                            <li class="link">
                                                <a href="components/DashboardComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >DashboardComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/SortComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >SortComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/ExportModule.html" data-type="entity-link" >ExportModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#components-links-module-ExportModule-b11c1482b04708758c3f9178d2fed375a8f4f9c92744851388ef880d31892b643bee53b234b8a6e79e26e931575c61718734f3d3ceee16bbcd0ebd7e529f226f"' : 'data-bs-target="#xs-components-links-module-ExportModule-b11c1482b04708758c3f9178d2fed375a8f4f9c92744851388ef880d31892b643bee53b234b8a6e79e26e931575c61718734f3d3ceee16bbcd0ebd7e529f226f"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-ExportModule-b11c1482b04708758c3f9178d2fed375a8f4f9c92744851388ef880d31892b643bee53b234b8a6e79e26e931575c61718734f3d3ceee16bbcd0ebd7e529f226f"' :
                                            'id="xs-components-links-module-ExportModule-b11c1482b04708758c3f9178d2fed375a8f4f9c92744851388ef880d31892b643bee53b234b8a6e79e26e931575c61718734f3d3ceee16bbcd0ebd7e529f226f"' }>
                                            <li class="link">
                                                <a href="components/ExportComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ExportComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/FormModule.html" data-type="entity-link" >FormModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#components-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' : 'data-bs-target="#xs-components-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' :
                                            'id="xs-components-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' }>
                                            <li class="link">
                                                <a href="components/FormComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FormComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/FormFieldWrapperComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FormFieldWrapperComponent</a>
                                            </li>
                                            <li class="link">
                                                <a href="components/TextFieldComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TextFieldComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#directives-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' : 'data-bs-target="#xs-directives-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' }>
                                        <span class="icon ion-md-code-working"></span>
                                        <span>Directives</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="directives-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' :
                                        'id="xs-directives-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' }>
                                        <li class="link">
                                            <a href="directives/FormFieldWrapperDirective.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FormFieldWrapperDirective</a>
                                        </li>
                                    </ul>
                                </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' : 'data-bs-target="#xs-injectables-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' :
                                        'id="xs-injectables-links-module-FormModule-7eaee315c9c20adb74347c287b76a0c52fdeade24d825052dde397d445219ae3d78e856f1e4739fd6a00ff8ea5ad6630441c77fe496c0a215f0aaffeb2004556"' }>
                                        <li class="link">
                                            <a href="injectables/FormService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >FormService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/LocalAuthModule.html" data-type="entity-link" >LocalAuthModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#components-links-module-LocalAuthModule-97b6209355604cf2a5e1769d12cbb4b72434f6d90ccce61446ab21e2af0e1d29320629fe19ee166b3d3779e3a09adca14e391aa91420ecc24b9ea94657ef2e56"' : 'data-bs-target="#xs-components-links-module-LocalAuthModule-97b6209355604cf2a5e1769d12cbb4b72434f6d90ccce61446ab21e2af0e1d29320629fe19ee166b3d3779e3a09adca14e391aa91420ecc24b9ea94657ef2e56"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-LocalAuthModule-97b6209355604cf2a5e1769d12cbb4b72434f6d90ccce61446ab21e2af0e1d29320629fe19ee166b3d3779e3a09adca14e391aa91420ecc24b9ea94657ef2e56"' :
                                            'id="xs-components-links-module-LocalAuthModule-97b6209355604cf2a5e1769d12cbb4b72434f6d90ccce61446ab21e2af0e1d29320629fe19ee166b3d3779e3a09adca14e391aa91420ecc24b9ea94657ef2e56"' }>
                                            <li class="link">
                                                <a href="components/LocalAuthComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >LocalAuthComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/ManageRolesModule.html" data-type="entity-link" >ManageRolesModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#components-links-module-ManageRolesModule-c7daea7630a7ae8e4c2da7b7c2a3aba992b23449e00f2cac3dae748803af7847e7d5a496380840d8db512c5a60fd07b89be2d79ff2e9edb00e5fa31d8d710252"' : 'data-bs-target="#xs-components-links-module-ManageRolesModule-c7daea7630a7ae8e4c2da7b7c2a3aba992b23449e00f2cac3dae748803af7847e7d5a496380840d8db512c5a60fd07b89be2d79ff2e9edb00e5fa31d8d710252"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-ManageRolesModule-c7daea7630a7ae8e4c2da7b7c2a3aba992b23449e00f2cac3dae748803af7847e7d5a496380840d8db512c5a60fd07b89be2d79ff2e9edb00e5fa31d8d710252"' :
                                            'id="xs-components-links-module-ManageRolesModule-c7daea7630a7ae8e4c2da7b7c2a3aba992b23449e00f2cac3dae748803af7847e7d5a496380840d8db512c5a60fd07b89be2d79ff2e9edb00e5fa31d8d710252"' }>
                                            <li class="link">
                                                <a href="components/ManageRolesComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ManageRolesComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/ManageUsersModule.html" data-type="entity-link" >ManageUsersModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#components-links-module-ManageUsersModule-f376eaeaa8f9a5be46d66e1e4de1993cce5da11fef63e24b5b65945e1957b82b0de2fc12c69fe6c14c02a69f80a55067963e304c571b14a3f339ee5fc1b3be06"' : 'data-bs-target="#xs-components-links-module-ManageUsersModule-f376eaeaa8f9a5be46d66e1e4de1993cce5da11fef63e24b5b65945e1957b82b0de2fc12c69fe6c14c02a69f80a55067963e304c571b14a3f339ee5fc1b3be06"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-ManageUsersModule-f376eaeaa8f9a5be46d66e1e4de1993cce5da11fef63e24b5b65945e1957b82b0de2fc12c69fe6c14c02a69f80a55067963e304c571b14a3f339ee5fc1b3be06"' :
                                            'id="xs-components-links-module-ManageUsersModule-f376eaeaa8f9a5be46d66e1e4de1993cce5da11fef63e24b5b65945e1957b82b0de2fc12c69fe6c14c02a69f80a55067963e304c571b14a3f339ee5fc1b3be06"' }>
                                            <li class="link">
                                                <a href="components/ManageUsersComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ManageUsersComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                            <li class="link">
                                <a href="modules/RedboxPortalCoreModule.html" data-type="entity-link" >RedboxPortalCoreModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#components-links-module-RedboxPortalCoreModule-df01317b8785dfd18436d9e55ec355234f892cdf2a98a944d7ca53d9c9c2248145758d9dc2b927fa5aa77ea3d704f7c17369840a15e21088de61beb2997e68a8"' : 'data-bs-target="#xs-components-links-module-RedboxPortalCoreModule-df01317b8785dfd18436d9e55ec355234f892cdf2a98a944d7ca53d9c9c2248145758d9dc2b927fa5aa77ea3d704f7c17369840a15e21088de61beb2997e68a8"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-RedboxPortalCoreModule-df01317b8785dfd18436d9e55ec355234f892cdf2a98a944d7ca53d9c9c2248145758d9dc2b927fa5aa77ea3d704f7c17369840a15e21088de61beb2997e68a8"' :
                                            'id="xs-components-links-module-RedboxPortalCoreModule-df01317b8785dfd18436d9e55ec355234f892cdf2a98a944d7ca53d9c9c2248145758d9dc2b927fa5aa77ea3d704f7c17369840a15e21088de61beb2997e68a8"' }>
                                            <li class="link">
                                                <a href="components/RecordTableComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RecordTableComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                                <li class="chapter inner">
                                    <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                        'data-bs-target="#injectables-links-module-RedboxPortalCoreModule-df01317b8785dfd18436d9e55ec355234f892cdf2a98a944d7ca53d9c9c2248145758d9dc2b927fa5aa77ea3d704f7c17369840a15e21088de61beb2997e68a8"' : 'data-bs-target="#xs-injectables-links-module-RedboxPortalCoreModule-df01317b8785dfd18436d9e55ec355234f892cdf2a98a944d7ca53d9c9c2248145758d9dc2b927fa5aa77ea3d704f7c17369840a15e21088de61beb2997e68a8"' }>
                                        <span class="icon ion-md-arrow-round-down"></span>
                                        <span>Injectables</span>
                                        <span class="icon ion-ios-arrow-down"></span>
                                    </div>
                                    <ul class="links collapse" ${ isNormalMode ? 'id="injectables-links-module-RedboxPortalCoreModule-df01317b8785dfd18436d9e55ec355234f892cdf2a98a944d7ca53d9c9c2248145758d9dc2b927fa5aa77ea3d704f7c17369840a15e21088de61beb2997e68a8"' :
                                        'id="xs-injectables-links-module-RedboxPortalCoreModule-df01317b8785dfd18436d9e55ec355234f892cdf2a98a944d7ca53d9c9c2248145758d9dc2b927fa5aa77ea3d704f7c17369840a15e21088de61beb2997e68a8"' }>
                                        <li class="link">
                                            <a href="injectables/ConfigService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ConfigService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/LoggerService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >LoggerService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/RecordService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >RecordService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/ReportService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ReportService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/TranslationService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >TranslationService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/UserService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >UserService</a>
                                        </li>
                                        <li class="link">
                                            <a href="injectables/UtilityService.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >UtilityService</a>
                                        </li>
                                    </ul>
                                </li>
                            </li>
                            <li class="link">
                                <a href="modules/ReportModule.html" data-type="entity-link" >ReportModule</a>
                                    <li class="chapter inner">
                                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ?
                                            'data-bs-target="#components-links-module-ReportModule-b5c894df6522e9ca2848410a5d2b08a195fd000a56d73c2ce6db32e1a9493834e6334cac0526f7afc86a7c8b03134e66d71f445f27b29c972b59df3dcf4ed3ba"' : 'data-bs-target="#xs-components-links-module-ReportModule-b5c894df6522e9ca2848410a5d2b08a195fd000a56d73c2ce6db32e1a9493834e6334cac0526f7afc86a7c8b03134e66d71f445f27b29c972b59df3dcf4ed3ba"' }>
                                            <span class="icon ion-md-cog"></span>
                                            <span>Components</span>
                                            <span class="icon ion-ios-arrow-down"></span>
                                        </div>
                                        <ul class="links collapse" ${ isNormalMode ? 'id="components-links-module-ReportModule-b5c894df6522e9ca2848410a5d2b08a195fd000a56d73c2ce6db32e1a9493834e6334cac0526f7afc86a7c8b03134e66d71f445f27b29c972b59df3dcf4ed3ba"' :
                                            'id="xs-components-links-module-ReportModule-b5c894df6522e9ca2848410a5d2b08a195fd000a56d73c2ce6db32e1a9493834e6334cac0526f7afc86a7c8b03134e66d71f445f27b29c972b59df3dcf4ed3ba"' }>
                                            <li class="link">
                                                <a href="components/ReportComponent.html" data-type="entity-link" data-context="sub-entity" data-context-id="modules" >ReportComponent</a>
                                            </li>
                                        </ul>
                                    </li>
                            </li>
                </ul>
                </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#components-links"' :
                            'data-bs-target="#xs-components-links"' }>
                            <span class="icon ion-md-cog"></span>
                            <span>Components</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="components-links"' : 'id="xs-components-links"' }>
                            <li class="link">
                                <a href="components/BaseComponent.html" data-type="entity-link" >BaseComponent</a>
                            </li>
                            <li class="link">
                                <a href="components/FormBaseComponent.html" data-type="entity-link" >FormBaseComponent</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#classes-links"' :
                            'data-bs-target="#xs-classes-links"' }>
                            <span class="icon ion-ios-paper"></span>
                            <span>Classes</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="classes-links"' : 'id="xs-classes-links"' }>
                            <li class="link">
                                <a href="classes/HttpClientService.html" data-type="entity-link" >HttpClientService</a>
                            </li>
                            <li class="link">
                                <a href="classes/ModelBase.html" data-type="entity-link" >ModelBase</a>
                            </li>
                            <li class="link">
                                <a href="classes/Plan.html" data-type="entity-link" >Plan</a>
                            </li>
                            <li class="link">
                                <a href="classes/PlanTable.html" data-type="entity-link" >PlanTable</a>
                            </li>
                            <li class="link">
                                <a href="classes/RecordResponseTable.html" data-type="entity-link" >RecordResponseTable</a>
                            </li>
                            <li class="link">
                                <a href="classes/TextField.html" data-type="entity-link" >TextField</a>
                            </li>
                        </ul>
                    </li>
                        <li class="chapter">
                            <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#injectables-links"' :
                                'data-bs-target="#xs-injectables-links"' }>
                                <span class="icon ion-md-arrow-round-down"></span>
                                <span>Injectables</span>
                                <span class="icon ion-ios-arrow-down"></span>
                            </div>
                            <ul class="links collapse " ${ isNormalMode ? 'id="injectables-links"' : 'id="xs-injectables-links"' }>
                                <li class="link">
                                    <a href="injectables/LoDashTemplateUtilityService.html" data-type="entity-link" >LoDashTemplateUtilityService</a>
                                </li>
                            </ul>
                        </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#interceptors-links"' :
                            'data-bs-target="#xs-interceptors-links"' }>
                            <span class="icon ion-ios-swap"></span>
                            <span>Interceptors</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="interceptors-links"' : 'id="xs-interceptors-links"' }>
                            <li class="link">
                                <a href="interceptors/CsrfInterceptor.html" data-type="entity-link" >CsrfInterceptor</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#interfaces-links"' :
                            'data-bs-target="#xs-interfaces-links"' }>
                            <span class="icon ion-md-information-circle-outline"></span>
                            <span>Interfaces</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? ' id="interfaces-links"' : 'id="xs-interfaces-links"' }>
                            <li class="link">
                                <a href="interfaces/ComponentFieldMap.html" data-type="entity-link" >ComponentFieldMap</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/ComponentFieldMapEntry.html" data-type="entity-link" >ComponentFieldMapEntry</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/FormComponentResolver.html" data-type="entity-link" >FormComponentResolver</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Initable.html" data-type="entity-link" >Initable</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/RecordSource.html" data-type="entity-link" >RecordSource</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/RecordTypeConf.html" data-type="entity-link" >RecordTypeConf</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Role.html" data-type="entity-link" >Role</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/SaveResult.html" data-type="entity-link" >SaveResult</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/Service.html" data-type="entity-link" >Service</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/User.html" data-type="entity-link" >User</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/UserForm.html" data-type="entity-link" >UserForm</a>
                            </li>
                            <li class="link">
                                <a href="interfaces/UserLoginResult.html" data-type="entity-link" >UserLoginResult</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <div class="simple menu-toggler" data-bs-toggle="collapse" ${ isNormalMode ? 'data-bs-target="#miscellaneous-links"'
                            : 'data-bs-target="#xs-miscellaneous-links"' }>
                            <span class="icon ion-ios-cube"></span>
                            <span>Miscellaneous</span>
                            <span class="icon ion-ios-arrow-down"></span>
                        </div>
                        <ul class="links collapse " ${ isNormalMode ? 'id="miscellaneous-links"' : 'id="xs-miscellaneous-links"' }>
                            <li class="link">
                                <a href="miscellaneous/functions.html" data-type="entity-link">Functions</a>
                            </li>
                            <li class="link">
                                <a href="miscellaneous/variables.html" data-type="entity-link">Variables</a>
                            </li>
                        </ul>
                    </li>
                    <li class="chapter">
                        <a data-type="chapter-link" href="coverage.html"><span class="icon ion-ios-stats"></span>Documentation coverage</a>
                    </li>
                    <li class="divider"></li>
                    <li class="copyright">
                        Documentation generated using <a href="https://compodoc.app/" target="_blank" rel="noopener noreferrer">
                            <img data-src="images/compodoc-vectorise-inverted.png" class="img-responsive" data-type="compodoc-logo">
                        </a>
                    </li>
            </ul>
        </nav>
        `);
        this.innerHTML = tp.strings;
    }
});